from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.models import Category, Product
from app.features.coupons.models import Coupon, CouponBranch
from app.features.organizations.models import OrganizationMember
from app.features.pricing.enums import Availability, StoreProductStatus
from app.features.pricing.models import PriceHistory, StoreProduct
from app.features.promotions.models import Promotion, PromotionBranch, PromotionProduct
from app.features.reports.enums import ReportPriority, ReportStatus
from app.features.reports.models import Report
from app.features.stores.models import StoreBranch
from app.features.users.models import User

_OPEN_REPORT_STATUSES = (ReportStatus.OPEN, ReportStatus.IN_REVIEW)


class B2BAnalyticsRepository:
    """Aggregate-only queries (COUNT/GROUP BY, no full-entity loads) backing the Fase 10.12
    Dashboard/Analytics endpoints. See `B2BAnalyticsService` for scope resolution and for the
    parts (promotion/coupon lifecycle, report grouping) intentionally left to Python reuse of
    already-existing resolvers/services rather than re-derived here in SQL."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _branch_scope(stmt, branch_ids: list[int] | None):
        return stmt.where(StoreProduct.store_branch_id.in_(branch_ids)) if branch_ids is not None else stmt

    async def count_active_branches(self, store_id: int, branch_ids: list[int] | None) -> int:
        """"Active branches" has no `StoreBranch.status` column to read (it doesn't exist) --
        defined here as branches with at least one ACTIVE StoreProduct listing, a data-driven
        substitute rather than a fabricated field."""
        stmt = (
            select(func.count(func.distinct(StoreProduct.store_branch_id)))
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(StoreBranch.store_id == store_id, StoreProduct.status == StoreProductStatus.ACTIVE)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return result.scalar_one()

    async def count_active_listings(self, store_id: int, branch_ids: list[int] | None) -> int:
        stmt = (
            select(func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(StoreBranch.store_id == store_id, StoreProduct.status == StoreProductStatus.ACTIVE)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return result.scalar_one()

    async def count_stale_prices(self, store_id: int, branch_ids: list[int] | None, cutoff: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(
                StoreBranch.store_id == store_id,
                StoreProduct.status == StoreProductStatus.ACTIVE,
                or_(StoreProduct.last_verified_at.is_(None), StoreProduct.last_verified_at < cutoff),
            )
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return result.scalar_one()

    async def stale_prices_by_branch(
        self, store_id: int, branch_ids: list[int] | None, cutoff: datetime
    ) -> list[tuple[int, str, int]]:
        stmt = (
            select(StoreBranch.id, StoreBranch.name, func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(
                StoreBranch.store_id == store_id,
                StoreProduct.status == StoreProductStatus.ACTIVE,
                or_(StoreProduct.last_verified_at.is_(None), StoreProduct.last_verified_at < cutoff),
            )
            .group_by(StoreBranch.id, StoreBranch.name)
            .order_by(func.count().desc())
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    async def count_out_of_stock(self, store_id: int, branch_ids: list[int] | None) -> int:
        stmt = (
            select(func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(
                StoreBranch.store_id == store_id,
                StoreProduct.status == StoreProductStatus.ACTIVE,
                StoreProduct.availability == Availability.OUT_OF_STOCK,
            )
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return result.scalar_one()

    async def availability_breakdown(self, store_id: int, branch_ids: list[int] | None) -> dict[Availability, int]:
        stmt = (
            select(StoreProduct.availability, func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(StoreBranch.store_id == store_id, StoreProduct.status == StoreProductStatus.ACTIVE)
            .group_by(StoreProduct.availability)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return dict(result.all())

    async def availability_by_branch(
        self, store_id: int, branch_ids: list[int] | None
    ) -> list[tuple[int, str, Availability, int]]:
        stmt = (
            select(StoreBranch.id, StoreBranch.name, StoreProduct.availability, func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(StoreBranch.store_id == store_id, StoreProduct.status == StoreProductStatus.ACTIVE)
            .group_by(StoreBranch.id, StoreBranch.name, StoreProduct.availability)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    async def active_listings_by_category(
        self, store_id: int, branch_ids: list[int] | None
    ) -> list[tuple[int, str, int]]:
        stmt = (
            select(Category.id, Category.name, func.count())
            .select_from(StoreProduct)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .join(Product, Product.id == StoreProduct.product_id)
            .join(Category, Category.id == Product.category_id)
            .where(StoreBranch.store_id == store_id, StoreProduct.status == StoreProductStatus.ACTIVE)
            .group_by(Category.id, Category.name)
            .order_by(func.count().desc())
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    async def price_changes(
        self, store_id: int, branch_ids: list[int] | None, date_from: datetime, date_to: datetime
    ) -> list[tuple[datetime, float | None, float, int, int, int]]:
        """Raw (updated_at, previous_price, new_price, store_branch_id, product_id,
        store_product_id) rows for the period -- only the columns needed, never full ORM
        entities. Bucketing/direction/magnitude are computed in Python (see service) since
        portable day/week/month grouping across SQLite (tests) and Postgres isn't expressible
        with one SQL date-trunc call."""
        stmt = (
            select(
                PriceHistory.updated_at,
                PriceHistory.previous_price,
                PriceHistory.new_price,
                StoreProduct.store_branch_id,
                StoreProduct.product_id,
                PriceHistory.store_product_id,
            )
            .select_from(PriceHistory)
            .join(StoreProduct, StoreProduct.id == PriceHistory.store_product_id)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(
                StoreBranch.store_id == store_id,
                PriceHistory.updated_at >= date_from,
                PriceHistory.updated_at < date_to,
            )
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    async def count_price_changes(
        self, store_id: int, branch_ids: list[int] | None, date_from: datetime, date_to: datetime
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(PriceHistory)
            .join(StoreProduct, StoreProduct.id == PriceHistory.store_product_id)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .where(
                StoreBranch.store_id == store_id,
                PriceHistory.updated_at >= date_from,
                PriceHistory.updated_at < date_to,
            )
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return result.scalar_one()

    async def top_products_by_price_changes(
        self, store_id: int, branch_ids: list[int] | None, date_from: datetime, date_to: datetime, limit: int = 10
    ) -> list[tuple[int, str, int, str, int, float, datetime]]:
        stmt = (
            select(
                Product.id,
                Product.canonical_name,
                StoreBranch.id,
                StoreBranch.name,
                func.count().label("changes_count"),
                StoreProduct.current_price,
                func.max(PriceHistory.updated_at),
            )
            .select_from(PriceHistory)
            .join(StoreProduct, StoreProduct.id == PriceHistory.store_product_id)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .join(Product, Product.id == StoreProduct.product_id)
            .where(
                StoreBranch.store_id == store_id,
                PriceHistory.updated_at >= date_from,
                PriceHistory.updated_at < date_to,
            )
            .group_by(Product.id, Product.canonical_name, StoreBranch.id, StoreBranch.name, StoreProduct.current_price)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    def _report_scope_clause(self, store_id: int, branch_ids: list[int] | None, scoped_product_ids: list[int]):
        if branch_ids is not None:
            direct_scope = Report.store_branch_id.in_(branch_ids)
        else:
            direct_scope = Report.store_id == store_id
        if scoped_product_ids:
            product_scope = and_(Report.store_id.is_(None), Report.product_id.in_(scoped_product_ids))
            return or_(direct_scope, product_scope)
        return direct_scope

    async def count_reports_by_status(
        self,
        store_id: int,
        branch_ids: list[int] | None,
        scoped_product_ids: list[int],
        statuses: tuple[ReportStatus, ...],
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        date_column=Report.resolved_at,
    ) -> int:
        stmt = select(func.count()).select_from(Report).where(
            self._report_scope_clause(store_id, branch_ids, scoped_product_ids), Report.status.in_(statuses)
        )
        if date_from is not None:
            stmt = stmt.where(date_column >= date_from)
        if date_to is not None:
            stmt = stmt.where(date_column < date_to)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def count_high_priority_open_reports(
        self, store_id: int, branch_ids: list[int] | None, scoped_product_ids: list[int]
    ) -> int:
        stmt = select(func.count()).select_from(Report).where(
            self._report_scope_clause(store_id, branch_ids, scoped_product_ids),
            Report.status.in_(_OPEN_REPORT_STATUSES),
            Report.priority.in_((ReportPriority.HIGH, ReportPriority.CRITICAL)),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def reports_by_type(
        self, store_id: int, branch_ids: list[int] | None, scoped_product_ids: list[int]
    ) -> list[tuple[str, int]]:
        stmt = (
            select(Report.type, func.count())
            .select_from(Report)
            .where(self._report_scope_clause(store_id, branch_ids, scoped_product_ids))
            .group_by(Report.type)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def reports_by_branch(
        self, store_id: int, branch_ids: list[int] | None, scoped_product_ids: list[int]
    ) -> list[tuple[int, str, int]]:
        stmt = (
            select(StoreBranch.id, StoreBranch.name, func.count())
            .select_from(Report)
            .join(StoreBranch, StoreBranch.id == Report.store_branch_id)
            .where(self._report_scope_clause(store_id, branch_ids, scoped_product_ids))
            .group_by(StoreBranch.id, StoreBranch.name)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def list_promotions(self, store_id: int, branch_ids: list[int] | None) -> list[Promotion]:
        """Small per-organization volume -- loaded as entities so the service can reuse
        `promotions.resolver.is_currently_active`/`derive_display_status` directly rather than
        re-deriving the same boundary logic in SQL."""
        stmt = select(Promotion).where(Promotion.store_id == store_id)
        if branch_ids is not None:
            stmt = stmt.where(
                Promotion.id.in_(select(PromotionBranch.promotion_id).where(PromotionBranch.store_branch_id.in_(branch_ids)))
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_coupons(self, store_id: int, branch_ids: list[int] | None) -> list[Coupon]:
        stmt = select(Coupon).where(Coupon.store_id == store_id)
        if branch_ids is not None:
            stmt = stmt.where(
                or_(
                    Coupon.applies_to_all_branches.is_(True),
                    Coupon.id.in_(select(CouponBranch.coupon_id).where(CouponBranch.store_branch_id.in_(branch_ids))),
                )
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def promotion_branch_counts(self, promotion_ids: list[int]) -> list[tuple[int, str, int]]:
        if not promotion_ids:
            return []
        stmt = (
            select(StoreBranch.id, StoreBranch.name, func.count())
            .select_from(PromotionBranch)
            .join(StoreBranch, StoreBranch.id == PromotionBranch.store_branch_id)
            .where(PromotionBranch.promotion_id.in_(promotion_ids))
            .group_by(StoreBranch.id, StoreBranch.name)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def coupon_branch_counts(self, coupon_ids: list[int]) -> list[tuple[int, str, int]]:
        if not coupon_ids:
            return []
        stmt = (
            select(StoreBranch.id, StoreBranch.name, func.count())
            .select_from(CouponBranch)
            .join(StoreBranch, StoreBranch.id == CouponBranch.store_branch_id)
            .where(CouponBranch.coupon_id.in_(coupon_ids))
            .group_by(StoreBranch.id, StoreBranch.name)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def count_promoted_products(self, promotion_ids: list[int]) -> int:
        if not promotion_ids:
            return 0
        stmt = select(func.count(func.distinct(PromotionProduct.product_id))).where(
            PromotionProduct.promotion_id.in_(promotion_ids)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def list_price_updates_for_activity(
        self, store_id: int, branch_ids: list[int] | None, date_from: datetime, date_to: datetime, limit: int
    ) -> list[tuple[datetime, str, int, str, float | None, float]]:
        stmt = (
            select(
                PriceHistory.updated_at,
                Product.canonical_name,
                StoreBranch.id,
                StoreBranch.name,
                PriceHistory.previous_price,
                PriceHistory.new_price,
            )
            .select_from(PriceHistory)
            .join(StoreProduct, StoreProduct.id == PriceHistory.store_product_id)
            .join(StoreBranch, StoreBranch.id == StoreProduct.store_branch_id)
            .join(Product, Product.id == StoreProduct.product_id)
            .where(
                StoreBranch.store_id == store_id,
                PriceHistory.updated_at >= date_from,
                PriceHistory.updated_at < date_to,
            )
            .order_by(PriceHistory.updated_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(self._branch_scope(stmt, branch_ids))
        return list(result.all())

    async def list_resolved_reports_for_activity(
        self,
        store_id: int,
        branch_ids: list[int] | None,
        scoped_product_ids: list[int],
        date_from: datetime,
        date_to: datetime,
        limit: int,
    ) -> list[tuple[datetime, str, int | None, str | None]]:
        stmt = (
            select(Report.resolved_at, Report.type, StoreBranch.id, StoreBranch.name)
            .select_from(Report)
            .outerjoin(StoreBranch, StoreBranch.id == Report.store_branch_id)
            .where(
                self._report_scope_clause(store_id, branch_ids, scoped_product_ids),
                Report.status == ReportStatus.RESOLVED,
                Report.resolved_at >= date_from,
                Report.resolved_at < date_to,
            )
            .order_by(Report.resolved_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def list_members_added_for_activity(
        self, store_id: int, date_from: datetime, date_to: datetime, limit: int
    ) -> list[tuple[datetime, str]]:
        stmt = (
            select(OrganizationMember.joined_at, User.email)
            .select_from(OrganizationMember)
            .join(User, User.id == OrganizationMember.user_id)
            .where(
                OrganizationMember.store_id == store_id,
                OrganizationMember.joined_at >= date_from,
                OrganizationMember.joined_at < date_to,
            )
            .order_by(OrganizationMember.joined_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.all())

    async def avg_resolution_seconds(
        self, store_id: int, branch_ids: list[int] | None, scoped_product_ids: list[int]
    ) -> list[tuple[datetime, datetime]]:
        """Returns raw (created_at, resolved_at) pairs for RESOLVED reports -- averaging the
        interval portably (SQLite has no native `extract(epoch from ...)`) happens in Python."""
        stmt = select(Report.created_at, Report.resolved_at).where(
            self._report_scope_clause(store_id, branch_ids, scoped_product_ids),
            Report.status == ReportStatus.RESOLVED,
            Report.resolved_at.isnot(None),
        )
        result = await self.session.execute(stmt)
        return list(result.all())
