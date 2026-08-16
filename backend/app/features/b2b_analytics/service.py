from datetime import datetime, timedelta, timezone
from statistics import median

from app.features.b2b_analytics.repository import B2BAnalyticsRepository
from app.features.b2b_analytics.schemas import (
    ActivityEntryRead,
    ActivityFeedRead,
    AvailabilityAnalyticsRead,
    AvailabilityByBranchRead,
    BranchCountRead,
    CategoryCountRead,
    CouponsAnalyticsRead,
    LifecycleCountsRead,
    OverviewRead,
    PriceTimeSeriesPointRead,
    PricingAnalyticsRead,
    PromotionsAnalyticsRead,
    ReportsAnalyticsRead,
    TopPriceChangeProductRead,
    TypeCountRead,
)
from app.features.coupons.enums import CouponDisplayStatus
from app.features.coupons.resolver import derive_display_status as coupon_display_status
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.models import OrganizationMember
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.enums import Availability
from app.features.pricing.repository import StoreProductRepository
from app.features.promotions.enums import PromotionDisplayStatus
from app.features.promotions.resolver import derive_display_status as promotion_display_status
from app.features.reports.enums import ReportStatus
from app.features.reports.models import Report
from app.shared.time_utils import as_aware_utc, month_start

_OPEN_REPORT_STATUSES = (ReportStatus.OPEN, ReportStatus.IN_REVIEW)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _bucket_start(dt: datetime, granularity: str) -> datetime:
    dt = as_aware_utc(dt)
    if granularity == "day":
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    if granularity == "week":
        week_start = dt - timedelta(days=dt.weekday())
        return datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    return month_start(dt)


def _granularity_for_range(date_from: datetime, date_to: datetime) -> str:
    span_days = (date_to - date_from).days
    if span_days <= 31:
        return "day"
    if span_days <= 180:
        return "week"
    return "month"


class B2BAnalyticsService:
    """Fase 10.12 Dashboard/Analytics -- role/branch-scoped read model built entirely from
    aggregation over existing tables (no new persisted state). Reuses the promotion/coupon
    lifecycle resolvers and the centralized `price_freshness_days` config rather than
    re-deriving either."""

    def __init__(
        self,
        repository: B2BAnalyticsRepository,
        membership: OrganizationMembershipService,
        store_products: StoreProductRepository,
        price_freshness_days: int,
    ) -> None:
        self.repository = repository
        self.membership = membership
        self.store_products = store_products
        self.price_freshness_days = price_freshness_days

    async def _resolve_scope(self, store_id: int, member: OrganizationMember) -> tuple[list[int] | None, list[int]]:
        """`None` means "no branch filter, sees the whole organization" (ORGANIZATION_ADMIN);
        a concrete list restricts every query to those branches (MANAGER/EMPLOYEE) -- same
        convention as `ReportService._visibility_params`."""
        is_admin = member.role == OrganizationRole.ORGANIZATION_ADMIN
        accessible = await self.membership.list_branches(store_id, member)
        listing_branch_ids = [b.id for b in accessible]
        branch_ids = None if is_admin else listing_branch_ids
        listed = await self.store_products.list_by_branches(listing_branch_ids, status=None)
        scoped_product_ids = list({sp.product_id for sp in listed})
        return branch_ids, scoped_product_ids

    def _apply_branch_filter(self, branch_ids: list[int] | None, requested: list[int] | None) -> list[int] | None:
        """Narrows the caller's scope by an optional `branch_ids` query filter -- never widens
        it: a MANAGER can't request branches outside their own scope."""
        if requested is None:
            return branch_ids
        if branch_ids is None:
            return requested
        return [b for b in branch_ids if b in requested]

    async def get_overview(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_ids: list[int] | None,
    ) -> OverviewRead:
        scope, scoped_product_ids = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)
        cutoff = _now() - timedelta(days=self.price_freshness_days)

        promotions = await self.repository.list_promotions(store_id, scope)
        coupons = await self.repository.list_coupons(store_id, scope)
        now = _now()
        active_promotions = sum(
            1 for p in promotions if promotion_display_status(p, now=now) == PromotionDisplayStatus.ACTIVE
        )
        active_coupons = sum(1 for c in coupons if coupon_display_status(c, now=now) == CouponDisplayStatus.ACTIVE)

        prices_updated = await self.repository.count_price_changes(store_id, scope, date_from, date_to)
        period_span = date_to - date_from
        previous_from, previous_to = date_from - period_span, date_from
        prices_updated_previous = await self.repository.count_price_changes(
            store_id, scope, previous_from, previous_to
        )

        open_count = await self.repository.count_reports_by_status(
            store_id, scope, scoped_product_ids, _OPEN_REPORT_STATUSES
        )
        high_priority_open = await self.repository.count_high_priority_open_reports(
            store_id, scope, scoped_product_ids
        )

        return OverviewRead(
            active_branches=await self.repository.count_active_branches(store_id, scope),
            active_listings=await self.repository.count_active_listings(store_id, scope),
            prices_updated=prices_updated,
            prices_updated_previous_period=prices_updated_previous,
            stale_prices=await self.repository.count_stale_prices(store_id, scope, cutoff),
            out_of_stock=await self.repository.count_out_of_stock(store_id, scope),
            open_reports=open_count,
            high_priority_open_reports=high_priority_open,
            active_promotions=active_promotions,
            active_coupons=active_coupons,
        )

    async def get_pricing_analytics(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_ids: list[int] | None,
    ) -> PricingAnalyticsRead:
        scope, _ = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)
        cutoff = _now() - timedelta(days=self.price_freshness_days)

        granularity = _granularity_for_range(date_from, date_to)
        rows = await self.repository.price_changes(store_id, scope, date_from, date_to)

        buckets: dict[datetime, list[int]] = {}
        changes_pct: list[float] = []
        increases = decreases = 0
        for updated_at, previous_price, new_price, *_rest in rows:
            key = _bucket_start(updated_at, granularity)
            bucket = buckets.setdefault(key, [0, 0, 0])
            bucket[0] += 1
            if previous_price is not None and new_price > previous_price:
                bucket[1] += 1
                increases += 1
            elif previous_price is not None and new_price < previous_price:
                bucket[2] += 1
                decreases += 1
            if previous_price:
                changes_pct.append(float((new_price - previous_price) / previous_price * 100))

        time_series = [
            PriceTimeSeriesPointRead(bucket_start=key, changes_count=v[0], increases_count=v[1], decreases_count=v[2])
            for key, v in sorted(buckets.items())
        ]

        top_rows = await self.repository.top_products_by_price_changes(store_id, scope, date_from, date_to)
        top_products = [
            TopPriceChangeProductRead(
                product_id=product_id,
                product_name=product_name,
                store_branch_id=branch_id,
                branch_name=branch_name,
                changes_count=changes_count,
                current_price=current_price,
                last_updated=last_updated,
            )
            for product_id, product_name, branch_id, branch_name, changes_count, current_price, last_updated in top_rows
        ]

        stale_rows = await self.repository.stale_prices_by_branch(store_id, scope, cutoff)
        stale_by_branch = [BranchCountRead(branch_id=bid, branch_name=name, count=count) for bid, name, count in stale_rows]

        return PricingAnalyticsRead(
            granularity=granularity,
            time_series=time_series,
            increases_count=increases,
            decreases_count=decreases,
            avg_change_percent=sum(changes_pct) / len(changes_pct) if changes_pct else None,
            median_change_percent=median(changes_pct) if changes_pct else None,
            top_products=top_products,
            stale_prices_by_branch=stale_by_branch,
        )

    async def get_availability_analytics(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        branch_ids: list[int] | None,
    ) -> AvailabilityAnalyticsRead:
        scope, _ = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)

        breakdown = await self.repository.availability_breakdown(store_id, scope)
        by_branch_rows = await self.repository.availability_by_branch(store_id, scope)
        by_branch: dict[int, AvailabilityByBranchRead] = {}
        for bid, name, availability, count in by_branch_rows:
            entry = by_branch.setdefault(
                bid, AvailabilityByBranchRead(branch_id=bid, branch_name=name, in_stock=0, out_of_stock=0, unknown=0)
            )
            if availability == Availability.IN_STOCK:
                entry.in_stock = count
            elif availability == Availability.OUT_OF_STOCK:
                entry.out_of_stock = count
            elif availability == Availability.UNKNOWN:
                entry.unknown = count

        category_rows = await self.repository.active_listings_by_category(store_id, scope)
        categories = [
            CategoryCountRead(category_id=cid, category_name=name, count=count) for cid, name, count in category_rows
        ]

        return AvailabilityAnalyticsRead(
            in_stock=breakdown.get(Availability.IN_STOCK, 0),
            out_of_stock=breakdown.get(Availability.OUT_OF_STOCK, 0),
            unknown=breakdown.get(Availability.UNKNOWN, 0),
            by_branch=list(by_branch.values()),
            active_listings_by_category=categories,
        )

    async def get_promotions_analytics(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        branch_ids: list[int] | None,
    ) -> PromotionsAnalyticsRead:
        scope, _ = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)

        promotions = await self.repository.list_promotions(store_id, scope)
        now = _now()
        counts = LifecycleCountsRead(active=0, scheduled=0, expired=0, cancelled=0)
        active_ids: list[int] = []
        by_type: dict[str, int] = {}
        for promotion in promotions:
            display_status = promotion_display_status(promotion, now=now)
            if display_status == PromotionDisplayStatus.ACTIVE:
                counts.active += 1
                active_ids.append(promotion.id)
                by_type[promotion.type.value] = by_type.get(promotion.type.value, 0) + 1
            elif display_status == PromotionDisplayStatus.SCHEDULED:
                counts.scheduled += 1
            elif display_status == PromotionDisplayStatus.EXPIRED:
                counts.expired += 1
            elif display_status == PromotionDisplayStatus.CANCELLED:
                counts.cancelled += 1

        branch_rows = await self.repository.promotion_branch_counts(active_ids)
        by_branch = [BranchCountRead(branch_id=bid, branch_name=name, count=count) for bid, name, count in branch_rows]
        products_promoted = await self.repository.count_promoted_products(active_ids)

        return PromotionsAnalyticsRead(
            counts=counts,
            by_branch=by_branch,
            by_type=[TypeCountRead(type=t, count=c) for t, c in by_type.items()],
            products_currently_promoted=products_promoted,
        )

    async def get_coupons_analytics(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        branch_ids: list[int] | None,
    ) -> CouponsAnalyticsRead:
        scope, _ = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)

        coupons = await self.repository.list_coupons(store_id, scope)
        now = _now()
        counts = LifecycleCountsRead(active=0, scheduled=0, expired=0, cancelled=0)
        active_ids: list[int] = []
        by_type: dict[str, int] = {}
        applies_all = 0
        for coupon in coupons:
            display_status = coupon_display_status(coupon, now=now)
            if display_status == CouponDisplayStatus.ACTIVE:
                counts.active += 1
                active_ids.append(coupon.id)
                by_type[coupon.type.value] = by_type.get(coupon.type.value, 0) + 1
                if coupon.applies_to_all_branches:
                    applies_all += 1
            elif display_status == CouponDisplayStatus.SCHEDULED:
                counts.scheduled += 1
            elif display_status == CouponDisplayStatus.EXPIRED:
                counts.expired += 1
            elif display_status == CouponDisplayStatus.CANCELLED:
                counts.cancelled += 1

        branch_rows = await self.repository.coupon_branch_counts(active_ids)
        by_branch = [BranchCountRead(branch_id=bid, branch_name=name, count=count) for bid, name, count in branch_rows]

        return CouponsAnalyticsRead(
            counts=counts,
            by_type=[TypeCountRead(type=t, count=c) for t, c in by_type.items()],
            by_branch=by_branch,
            applies_to_all_branches_count=applies_all,
        )

    async def get_reports_analytics(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_ids: list[int] | None,
    ) -> ReportsAnalyticsRead:
        scope, scoped_product_ids = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)

        open_count = await self.repository.count_reports_by_status(store_id, scope, scoped_product_ids, _OPEN_REPORT_STATUSES)
        in_review_count = await self.repository.count_reports_by_status(
            store_id, scope, scoped_product_ids, (ReportStatus.IN_REVIEW,)
        )
        high_priority_open = await self.repository.count_high_priority_open_reports(store_id, scope, scoped_product_ids)
        resolved_count = await self.repository.count_reports_by_status(
            store_id, scope, scoped_product_ids, (ReportStatus.RESOLVED,), date_from=date_from, date_to=date_to
        )
        dismissed_count = await self.repository.count_reports_by_status(
            store_id,
            scope,
            scoped_product_ids,
            (ReportStatus.DISMISSED,),
            date_from=date_from,
            date_to=date_to,
            date_column=Report.dismissed_at,
        )

        period_span = date_to - date_from
        previous_from, previous_to = date_from - period_span, date_from
        resolved_previous = await self.repository.count_reports_by_status(
            store_id, scope, scoped_product_ids, (ReportStatus.RESOLVED,), date_from=previous_from, date_to=previous_to
        )

        type_rows = await self.repository.reports_by_type(store_id, scope, scoped_product_ids)
        branch_rows = await self.repository.reports_by_branch(store_id, scope, scoped_product_ids)
        resolution_pairs = await self.repository.avg_resolution_seconds(store_id, scope, scoped_product_ids)
        durations_hours = [
            (as_aware_utc(resolved_at) - as_aware_utc(created_at)).total_seconds() / 3600
            for created_at, resolved_at in resolution_pairs
        ]

        return ReportsAnalyticsRead(
            open_count=open_count,
            in_review_count=in_review_count,
            high_priority_open_count=high_priority_open,
            resolved_count=resolved_count,
            dismissed_count=dismissed_count,
            resolved_previous_period_count=resolved_previous,
            by_type=[TypeCountRead(type=t.value, count=c) for t, c in type_rows],
            by_branch=[BranchCountRead(branch_id=bid, branch_name=name, count=count) for bid, name, count in branch_rows],
            avg_resolution_hours=sum(durations_hours) / len(durations_hours) if durations_hours else None,
        )

    async def get_activity_feed(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_ids: list[int] | None,
        limit: int = 50,
    ) -> ActivityFeedRead:
        """Read model synthesized from existing timestamped tables -- no dedicated event log
        exists. Listing activated/deactivated and availability-changed events are intentionally
        omitted: `StoreProduct.updated_at` is shared across price/availability/status edits with
        no way to tell which changed, so reconstructing those specific event types would be
        invented telemetry rather than derived from real data."""
        scope, scoped_product_ids = await self._resolve_scope(store_id, member)
        scope = self._apply_branch_filter(scope, branch_ids)

        entries: list[ActivityEntryRead] = []

        for updated_at, product_name, bid, bname, previous_price, new_price in await self.repository.list_price_updates_for_activity(
            store_id, scope, date_from, date_to, limit
        ):
            direction = "subió" if previous_price is not None and new_price > previous_price else "bajó"
            entries.append(
                ActivityEntryRead(
                    type="price_updated",
                    description=f"Precio de {product_name} {direction} a {new_price}",
                    occurred_at=updated_at,
                    branch_id=bid,
                    branch_name=bname,
                )
            )

        for promotion in await self.repository.list_promotions(store_id, scope):
            updated_at = as_aware_utc(promotion.updated_at)
            if not (date_from <= updated_at < date_to):
                continue
            if promotion.status.value == "published":
                entries.append(
                    ActivityEntryRead(
                        type="promotion_published",
                        description=f"Promoción publicada: {promotion.name}",
                        occurred_at=updated_at,
                        branch_id=None,
                        branch_name=None,
                    )
                )
            elif promotion.status.value == "cancelled":
                entries.append(
                    ActivityEntryRead(
                        type="promotion_cancelled",
                        description=f"Promoción cancelada: {promotion.name}",
                        occurred_at=updated_at,
                        branch_id=None,
                        branch_name=None,
                    )
                )

        for coupon in await self.repository.list_coupons(store_id, scope):
            updated_at = as_aware_utc(coupon.updated_at)
            if not (date_from <= updated_at < date_to):
                continue
            if coupon.status.value == "published":
                entries.append(
                    ActivityEntryRead(
                        type="coupon_published",
                        description=f"Cupón publicado: {coupon.code}",
                        occurred_at=updated_at,
                        branch_id=None,
                        branch_name=None,
                    )
                )
            elif coupon.status.value == "cancelled":
                entries.append(
                    ActivityEntryRead(
                        type="coupon_cancelled",
                        description=f"Cupón cancelado: {coupon.code}",
                        occurred_at=updated_at,
                        branch_id=None,
                        branch_name=None,
                    )
                )

        for resolved_at, report_type, bid, bname in await self.repository.list_resolved_reports_for_activity(
            store_id, scope, scoped_product_ids, date_from, date_to, limit
        ):
            entries.append(
                ActivityEntryRead(
                    type="report_resolved",
                    description=f"Reporte resuelto: {report_type.value}",
                    occurred_at=resolved_at,
                    branch_id=bid,
                    branch_name=bname,
                )
            )

        for joined_at, email in await self.repository.list_members_added_for_activity(store_id, date_from, date_to, limit):
            entries.append(
                ActivityEntryRead(
                    type="member_added",
                    description=f"Nuevo miembro: {email}",
                    occurred_at=joined_at,
                    branch_id=None,
                    branch_name=None,
                )
            )

        entries.sort(key=lambda e: e.occurred_at, reverse=True)
        return ActivityFeedRead(items=entries[:limit])
