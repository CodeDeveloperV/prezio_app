from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.models import Product
from app.features.catalog.repository import ProductBarcodeRepository, ProductRepository
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.models import OrganizationMember
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.exceptions import StoreProductNotFound
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.reports.enums import DEFAULT_PRIORITY_BY_TYPE, ReportPriority, ReportResolutionType, ReportStatus, ReportType
from app.features.reports.exceptions import (
    InvalidReportScope,
    InvalidReportTransition,
    ReportNotFound,
    ReportPermissionDenied,
)
from app.features.reports.models import Report, ReportActivity
from app.features.reports.repository import ReportRepository
from app.features.reports.schemas import (
    ReportActivityRead,
    ReportAssignRequest,
    ReportCreate,
    ReportDismissRequest,
    ReportListItemRead,
    ReportListRead,
    ReportPriorityUpdate,
    ReportRead,
    ReportResolveRequest,
    ReportSummaryRead,
)
from app.features.stores.models import StoreBranch
from app.features.stores.repository import StoreBranchRepository

_OPEN_STATUSES = (ReportStatus.OPEN, ReportStatus.IN_REVIEW)
_PRIORITY_ORDER = {
    ReportPriority.LOW: 0,
    ReportPriority.MEDIUM: 1,
    ReportPriority.HIGH: 2,
    ReportPriority.CRITICAL: 3,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _group_key(report: Report) -> tuple:
    return (report.type, report.product_id, report.store_product_id, report.store_branch_id)


@dataclass
class _ReportGroup:
    representative: Report
    count: int
    first_reported_at: datetime
    latest_reported_at: datetime


class ReportService:
    def __init__(
        self,
        db: AsyncSession,
        reports: ReportRepository,
        membership: OrganizationMembershipService,
        products: ProductRepository,
        barcodes: ProductBarcodeRepository,
        store_products: StoreProductRepository,
        store_branches: StoreBranchRepository,
    ) -> None:
        self.db = db
        self.reports = reports
        self.membership = membership
        self.products = products
        self.barcodes = barcodes
        self.store_products = store_products
        self.store_branches = store_branches

    # -- end-user producer -------------------------------------------------

    async def create_report(self, payload: ReportCreate, reporter_user_id: int) -> Report:
        product: Product | None = None
        store_product: StoreProduct | None = None
        store_branch: StoreBranch | None = None

        if payload.product_id is not None:
            product = await self.products.get_by_id(payload.product_id)
            if product is None:
                raise ProductNotFound(payload.product_id)
        if payload.barcode_id is not None:
            barcode = await self.barcodes.get_by_id(payload.barcode_id)
            if barcode is None:
                raise InvalidReportScope(f"barcode_id {payload.barcode_id} does not exist")
            if payload.product_id is not None and barcode.product_id != payload.product_id:
                raise InvalidReportScope("barcode_id does not belong to product_id")
        if payload.store_product_id is not None:
            store_product = await self.store_products.get_by_id(payload.store_product_id)
            if store_product is None:
                raise StoreProductNotFound(payload.store_product_id)
        if payload.store_branch_id is not None:
            store_branch = await self.store_branches.get_by_id(payload.store_branch_id)
            if store_branch is None:
                raise InvalidReportScope(f"store_branch_id {payload.store_branch_id} does not exist")

        resolved_branch_id = payload.store_branch_id
        if resolved_branch_id is None and store_product is not None:
            resolved_branch_id = store_product.store_branch_id
            store_branch = await self.store_branches.get_by_id(resolved_branch_id)

        store_id = store_branch.store_id if store_branch is not None else None

        snapshot = None
        if store_product is not None:
            snapshot = {
                "current_price": float(store_product.current_price),
                "availability": store_product.availability.value,
                "version": store_product.version,
            }

        report = Report(
            store_id=store_id,
            type=payload.type,
            status=ReportStatus.OPEN,
            priority=DEFAULT_PRIORITY_BY_TYPE[payload.type],
            reporter_user_id=reporter_user_id,
            product_id=payload.product_id,
            barcode_id=payload.barcode_id,
            correction_kind=payload.correction_kind,
            store_product_id=payload.store_product_id,
            store_branch_id=resolved_branch_id,
            description=payload.description,
            reported_value=payload.reported_value,
            current_value_snapshot=snapshot,
        )
        await self.reports.add(report)
        await self.db.commit()
        reloaded = await self.reports.get_by_id(report.id)
        assert reloaded is not None
        return reloaded

    # -- B2B read operations -------------------------------------------------

    async def _visibility_params(self, store_id: int, member: OrganizationMember) -> tuple[list[int] | None, list[int]]:
        is_admin = member.role == OrganizationRole.ORGANIZATION_ADMIN
        accessible = await self.membership.list_branches(store_id, member)
        listing_branch_ids = [b.id for b in accessible]
        branch_ids = None if is_admin else listing_branch_ids
        listed = await self.store_products.list_by_branches(listing_branch_ids, status=None)
        scoped_product_ids = list({sp.product_id for sp in listed})
        return branch_ids, scoped_product_ids

    async def get_summary(self, store_id: int, member: OrganizationMember) -> ReportSummaryRead:
        branch_ids, scoped_product_ids = await self._visibility_params(store_id, member)
        reports = await self.reports.list_visible(
            store_id=store_id, branch_ids=branch_ids, scoped_product_ids=scoped_product_ids
        )
        groups = self._group(reports)
        open_count = sum(1 for g in groups if g.representative.status == ReportStatus.OPEN)
        in_review_count = sum(1 for g in groups if g.representative.status == ReportStatus.IN_REVIEW)
        high_priority_open_count = sum(
            1
            for g in groups
            if g.representative.status in _OPEN_STATUSES
            and g.representative.priority in (ReportPriority.HIGH, ReportPriority.CRITICAL)
        )
        week_ago = _now() - timedelta(days=7)
        resolved_this_week_count = sum(
            1
            for r in reports
            if r.status == ReportStatus.RESOLVED and r.resolved_at is not None and r.resolved_at >= week_ago
        )
        return ReportSummaryRead(
            open_count=open_count,
            in_review_count=in_review_count,
            high_priority_open_count=high_priority_open_count,
            resolved_this_week_count=resolved_this_week_count,
        )

    async def list_reports(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        status: ReportStatus | None = None,
        type: ReportType | None = None,
        priority: ReportPriority | None = None,
        branch_id: int | None = None,
        product_id: int | None = None,
        store_product_id: int | None = None,
        assigned_to_user_id: int | None = None,
        unassigned: bool = False,
        only_open: bool = False,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ReportListRead:
        if branch_id is not None:
            await self.membership.authorize_branch(store_id, member, branch_id)

        branch_ids, scoped_product_ids = await self._visibility_params(store_id, member)
        reports = await self.reports.list_visible(
            store_id=store_id,
            branch_ids=branch_ids,
            scoped_product_ids=scoped_product_ids,
            status=status,
            type=type,
            priority=priority,
            product_id=product_id,
            store_product_id=store_product_id,
            assigned_to_user_id=assigned_to_user_id,
            unassigned=unassigned,
            only_open=only_open,
            date_from=date_from,
            date_to=date_to,
        )
        if branch_id is not None:
            reports = [r for r in reports if r.store_branch_id == branch_id]

        groups = self._apply_sort(self._group(reports), sort)
        total = len(groups)
        start = (page - 1) * page_size
        page_items = groups[start : start + page_size]
        items = [await self._to_list_item(g) for g in page_items]
        return ReportListRead(items=items, total=total, page=page, page_size=page_size)

    async def get_report(self, store_id: int, member: OrganizationMember, report_id: int) -> ReportRead:
        report = await self._get_visible(store_id, member, report_id)
        return await self._to_read(report)

    async def _get_visible(self, store_id: int, member: OrganizationMember, report_id: int) -> Report:
        report = await self.reports.get_by_id(report_id)
        if report is None:
            raise ReportNotFound(report_id)
        await self._authorize_visibility(store_id, member, report)
        return report

    async def _authorize_visibility(self, store_id: int, member: OrganizationMember, report: Report) -> None:
        """Multi-tenant isolation (spec section 24): a report that belongs to another
        organization's branch/store-product must look exactly like a nonexistent report --
        never a 403 that would confirm its existence."""
        if report.store_id == store_id:
            if member.role != OrganizationRole.ORGANIZATION_ADMIN and report.store_branch_id is not None:
                accessible_ids = {b.id for b in await self.membership.list_branches(store_id, member)}
                if report.store_branch_id not in accessible_ids:
                    raise ReportNotFound(report.id)
            return
        if report.store_id is None and report.product_id is not None:
            _, scoped_product_ids = await self._visibility_params(store_id, member)
            if report.product_id in scoped_product_ids:
                return
        raise ReportNotFound(report.id)

    # -- B2B write operations -------------------------------------------------

    def _require_operator(self, member: OrganizationMember) -> None:
        if member.role == OrganizationRole.EMPLOYEE:
            raise ReportPermissionDenied("Employees have read-only access to reports")

    async def take_report(self, store_id: int, member: OrganizationMember, report_id: int, user_id: int) -> ReportRead:
        """Self-assign + move to IN_REVIEW in one action -- the "Tomar reporte" button (spec
        section 21). Only legal from OPEN, same as `mark_in_review`."""
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        if report.status != ReportStatus.OPEN:
            raise InvalidReportTransition("Only an open report can be taken")
        report.status = ReportStatus.IN_REVIEW
        report.assigned_to_user_id = user_id
        await self._log_activity(report, user_id, "assigned", note=f"assigned_to={user_id}")
        await self._log_activity(report, user_id, "status_changed", note="open -> in_review")
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def mark_in_review(self, store_id: int, member: OrganizationMember, report_id: int, user_id: int) -> ReportRead:
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        if report.status != ReportStatus.OPEN:
            raise InvalidReportTransition("Only an open report can be marked in review")
        report.status = ReportStatus.IN_REVIEW
        await self._log_activity(report, user_id, "status_changed", note="open -> in_review")
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def assign_report(
        self, store_id: int, member: OrganizationMember, report_id: int, payload: ReportAssignRequest, user_id: int
    ) -> ReportRead:
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        if report.status not in _OPEN_STATUSES:
            raise InvalidReportTransition("Cannot assign a resolved or dismissed report")
        target = payload.assigned_to_user_id if payload.assigned_to_user_id is not None else user_id
        report.assigned_to_user_id = target
        await self._log_activity(report, user_id, "assigned", note=f"assigned_to={target}")
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def update_priority(
        self, store_id: int, member: OrganizationMember, report_id: int, payload: ReportPriorityUpdate, user_id: int
    ) -> ReportRead:
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        report.priority = payload.priority
        await self._log_activity(report, user_id, "priority_changed", note=payload.priority.value)
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def resolve_report(
        self, store_id: int, member: OrganizationMember, report_id: int, payload: ReportResolveRequest, user_id: int
    ) -> ReportRead:
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        if report.status not in _OPEN_STATUSES:
            raise InvalidReportTransition("Only an open or in-review report can be resolved")
        await self._close_group(
            report,
            target_status=ReportStatus.RESOLVED,
            user_id=user_id,
            resolution_type=payload.resolution_type,
            resolution_note=payload.resolution_note,
        )
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def dismiss_report(
        self, store_id: int, member: OrganizationMember, report_id: int, payload: ReportDismissRequest, user_id: int
    ) -> ReportRead:
        self._require_operator(member)
        report = await self._get_visible(store_id, member, report_id)
        if report.status not in _OPEN_STATUSES:
            raise InvalidReportTransition("Only an open or in-review report can be dismissed")
        await self._close_group(
            report, target_status=ReportStatus.DISMISSED, user_id=user_id, resolution_note=payload.resolution_note
        )
        await self.db.commit()
        return await self._to_read(await self._reload(report.id))

    async def _close_group(
        self,
        report: Report,
        *,
        target_status: ReportStatus,
        user_id: int,
        resolution_type: ReportResolutionType | None = None,
        resolution_note: str | None = None,
    ) -> None:
        """Resolving/dismissing one report closes every still-open sibling sharing the same
        (type, product_id, store_product_id, store_branch_id) group, so N duplicate reports of
        the same underlying issue don't need N separate operator actions (spec section 8). This
        never needs an explicit RESOLVED -> OPEN transition (banned by spec section 6): a fresh
        report submitted after resolution simply starts a brand new active group instance."""
        now = _now()
        siblings = await self.reports.list_group_siblings(report)
        for sibling in siblings:
            if sibling.status not in _OPEN_STATUSES:
                continue
            sibling.status = target_status
            if target_status == ReportStatus.RESOLVED:
                sibling.resolution_type = resolution_type
                sibling.resolution_note = resolution_note
                sibling.resolved_by = user_id
                sibling.resolved_at = now
            else:
                sibling.resolution_note = resolution_note
                sibling.dismissed_by = user_id
                sibling.dismissed_at = now
            await self._log_activity(sibling, user_id, target_status.value, note=resolution_note)

    async def _log_activity(self, report: Report, actor_user_id: int, action: str, *, note: str | None = None) -> None:
        self.db.add(ReportActivity(report_id=report.id, actor_user_id=actor_user_id, action=action, note=note))
        await self.db.flush()

    async def _reload(self, report_id: int) -> Report:
        reloaded = await self.reports.get_by_id(report_id)
        assert reloaded is not None
        return reloaded

    # -- grouping / read model -------------------------------------------------

    def _group(self, reports: list[Report]) -> list[_ReportGroup]:
        buckets: dict[tuple, list[Report]] = {}
        for r in reports:
            buckets.setdefault(_group_key(r), []).append(r)
        groups = []
        for members in buckets.values():
            members.sort(key=lambda r: r.created_at)
            groups.append(
                _ReportGroup(
                    representative=members[-1],
                    count=len(members),
                    first_reported_at=members[0].created_at,
                    latest_reported_at=members[-1].created_at,
                )
            )
        return groups

    def _apply_sort(self, groups: list[_ReportGroup], sort: str | None) -> list[_ReportGroup]:
        if sort == "priority":
            groups.sort(key=lambda g: _PRIORITY_ORDER[g.representative.priority], reverse=True)
        elif sort == "report_count":
            groups.sort(key=lambda g: g.count, reverse=True)
        elif sort == "latest_activity":
            groups.sort(key=lambda g: g.latest_reported_at, reverse=True)
        else:
            groups.sort(key=lambda g: g.representative.created_at, reverse=True)
        return groups

    # -- display resolution / serialization -------------------------------------------------

    async def _resolve_display(
        self, report: Report
    ) -> tuple[Product | None, StoreBranch | None, StoreProduct | None]:
        """Resolves the product/branch to display for any report type: types that only carry
        `store_product_id` (e.g. INCORRECT_PRICE) still need a product/branch name shown in the
        UI, so this follows `store_product_id` -> `StoreProduct` -> product/branch whenever the
        report doesn't already carry `product_id`/`store_branch_id` directly."""
        store_product: StoreProduct | None = None
        if report.store_product_id is not None:
            store_product = await self.store_products.get_by_id(report.store_product_id)

        resolved_product_id = report.product_id or (store_product.product_id if store_product else None)
        product = await self.products.get_with_relations(resolved_product_id) if resolved_product_id else None

        resolved_branch_id = report.store_branch_id or (store_product.store_branch_id if store_product else None)
        branch = await self.store_branches.get_by_id(resolved_branch_id) if resolved_branch_id else None

        return product, branch, store_product

    async def _to_list_item(self, group: _ReportGroup) -> ReportListItemRead:
        r = group.representative
        product, branch, _store_product = await self._resolve_display(r)
        current_price = None
        reported_price = None
        if r.type == ReportType.INCORRECT_PRICE:
            if r.current_value_snapshot:
                current_price = r.current_value_snapshot.get("current_price")
            if r.reported_value:
                reported_price = r.reported_value.get("reported_price")
        return ReportListItemRead(
            id=r.id,
            type=r.type,
            status=r.status,
            priority=r.priority,
            product_id=r.product_id,
            product_name=product.canonical_name if product else None,
            store_product_id=r.store_product_id,
            store_branch_id=r.store_branch_id,
            branch_name=branch.name if branch else None,
            current_price=current_price,
            reported_price=reported_price,
            assigned_to_user_id=r.assigned_to_user_id,
            group_report_count=group.count,
            latest_reported_at=group.latest_reported_at,
            created_at=r.created_at,
        )

    async def _to_read(self, report: Report) -> ReportRead:
        product, branch, _store_product = await self._resolve_display(report)
        siblings = await self.reports.list_group_siblings(report)
        count = len(siblings)
        first = min((s.created_at for s in siblings), default=report.created_at)
        latest = max((s.created_at for s in siblings), default=report.created_at)
        barcode = None
        if product is not None and product.barcodes:
            barcode = product.barcodes[0].barcode

        return ReportRead(
            id=report.id,
            type=report.type,
            status=report.status,
            priority=report.priority,
            reporter_user_id=report.reporter_user_id,
            product_id=report.product_id or (product.id if product else None),
            product_name=product.canonical_name if product else None,
            store_product_id=report.store_product_id,
            store_branch_id=report.store_branch_id,
            branch_name=branch.name if branch else None,
            barcode=barcode,
            description=report.description,
            reported_value=report.reported_value,
            current_value_snapshot=report.current_value_snapshot,
            assigned_to_user_id=report.assigned_to_user_id,
            resolution_type=report.resolution_type,
            resolution_note=report.resolution_note,
            resolved_by=report.resolved_by,
            resolved_at=report.resolved_at,
            dismissed_by=report.dismissed_by,
            dismissed_at=report.dismissed_at,
            group_report_count=count,
            first_reported_at=first,
            latest_reported_at=latest,
            created_at=report.created_at,
            updated_at=report.updated_at,
            activities=[
                ReportActivityRead(
                    id=a.id, actor_user_id=a.actor_user_id, action=a.action, note=a.note, created_at=a.created_at
                )
                for a in report.activities
            ],
        )
