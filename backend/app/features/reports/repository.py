from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import selectinload

from app.features.reports.enums import ReportPriority, ReportStatus, ReportType
from app.features.reports.models import Report, ReportActivity
from app.shared.base_repository import BaseRepository

OPEN_STATUSES = (ReportStatus.OPEN, ReportStatus.IN_REVIEW)


def _match(column, value):
    """None-safe equality: two report rows are in the same group only if a scope field is
    either equal on both, or null on both -- a plain `==` would never match two NULLs."""
    return column.is_(None) if value is None else column == value


class ReportRepository(BaseRepository[Report]):
    model = Report

    async def get_by_id(self, entity_id: int) -> Report | None:
        result = await self.session.execute(
            select(Report)
            .where(Report.id == entity_id)
            .options(selectinload(Report.activities))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_visible(
        self,
        *,
        store_id: int,
        branch_ids: list[int] | None,
        scoped_product_ids: list[int],
        status: ReportStatus | None = None,
        type: ReportType | None = None,
        priority: ReportPriority | None = None,
        product_id: int | None = None,
        store_product_id: int | None = None,
        assigned_to_user_id: int | None = None,
        unassigned: bool = False,
        only_open: bool = False,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 5000,
    ) -> list[Report]:
        """Every report this organization/branch-scope may see: a direct match (`store_id` for
        an org-wide caller, i.e. `branch_ids is None`; or `store_branch_id` within `branch_ids`
        for a branch-scoped caller) OR a product-only report (no `store_id`) whose product is
        in `scoped_product_ids` (the caller's own currently/previously listed products). Capped
        at `limit`, newest first -- grouping/aggregation happens in Python afterwards (see
        `ReportService._group`), which is fine at this stage's expected volume.
        """
        if branch_ids is not None:
            direct_scope = Report.store_branch_id.in_(branch_ids)
        else:
            direct_scope = Report.store_id == store_id

        scope_clause = direct_scope
        if scoped_product_ids:
            product_scope = and_(Report.store_id.is_(None), Report.product_id.in_(scoped_product_ids))
            scope_clause = or_(direct_scope, product_scope)

        stmt = select(Report).where(scope_clause)
        if status is not None:
            stmt = stmt.where(Report.status == status)
        elif only_open:
            stmt = stmt.where(Report.status.in_(OPEN_STATUSES))
        if type is not None:
            stmt = stmt.where(Report.type == type)
        if priority is not None:
            stmt = stmt.where(Report.priority == priority)
        if product_id is not None:
            stmt = stmt.where(Report.product_id == product_id)
        if store_product_id is not None:
            stmt = stmt.where(Report.store_product_id == store_product_id)
        if unassigned:
            stmt = stmt.where(Report.assigned_to_user_id.is_(None))
        elif assigned_to_user_id is not None:
            stmt = stmt.where(Report.assigned_to_user_id == assigned_to_user_id)
        if date_from is not None:
            stmt = stmt.where(Report.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Report.created_at <= date_to)

        stmt = stmt.options(selectinload(Report.activities)).order_by(Report.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_group_siblings(self, report: Report) -> list[Report]:
        """Every report sharing the same (type, product_id, store_product_id, store_branch_id)
        group key as `report`, regardless of status -- used both to compute `report_count` /
        `first_reported_at` / `latest_reported_at` for the read-model grouping, and to cascade
        resolve/dismiss actions to open siblings (spec section 8)."""
        stmt = select(Report).where(
            Report.type == report.type,
            _match(Report.product_id, report.product_id),
            _match(Report.store_product_id, report.store_product_id),
            _match(Report.store_branch_id, report.store_branch_id),
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class ReportActivityRepository(BaseRepository[ReportActivity]):
    model = ReportActivity
