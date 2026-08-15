from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.features.promotions.enums import PromotionDisplayStatus, PromotionStatus, PromotionType
from app.features.promotions.models import Promotion, PromotionBranch, PromotionProduct
from app.shared.base_repository import BaseRepository


class PromotionRepository(BaseRepository[Promotion]):
    model = Promotion

    async def get_by_id(self, entity_id: int) -> Promotion | None:
        result = await self.session.execute(
            select(Promotion)
            .where(Promotion.id == entity_id)
            .options(selectinload(Promotion.branches), selectinload(Promotion.products))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        store_id: int,
        *,
        now: datetime,
        name: str | None = None,
        status: PromotionStatus | None = None,
        type: PromotionType | None = None,
        branch_ids: list[int] | None = None,
        product_id: int | None = None,
        display_status: PromotionDisplayStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Promotion], int]:
        """`branch_ids`, when given, matches a promotion covering ANY of those branches --
        callers pass a single-element list for an exact filter, or the caller's full
        accessible-branch set to scope a MANAGER/EMPLOYEE's listing to their own branches."""
        stmt = select(Promotion).where(Promotion.store_id == store_id)
        if name:
            stmt = stmt.where(Promotion.name.ilike(f"%{name.strip()}%"))
        if status is not None:
            stmt = stmt.where(Promotion.status == status)
        if type is not None:
            stmt = stmt.where(Promotion.type == type)
        if branch_ids is not None:
            stmt = stmt.join(PromotionBranch, PromotionBranch.promotion_id == Promotion.id).where(
                PromotionBranch.store_branch_id.in_(branch_ids)
            )
        if product_id is not None:
            stmt = stmt.join(PromotionProduct, PromotionProduct.promotion_id == Promotion.id).where(
                PromotionProduct.product_id == product_id
            )

        if display_status == PromotionDisplayStatus.DRAFT:
            stmt = stmt.where(Promotion.status == PromotionStatus.DRAFT)
        elif display_status == PromotionDisplayStatus.CANCELLED:
            stmt = stmt.where(Promotion.status == PromotionStatus.CANCELLED)
        elif display_status == PromotionDisplayStatus.SCHEDULED:
            stmt = stmt.where(Promotion.status == PromotionStatus.PUBLISHED, Promotion.start_at > now)
        elif display_status == PromotionDisplayStatus.ACTIVE:
            stmt = stmt.where(
                Promotion.status == PromotionStatus.PUBLISHED,
                Promotion.start_at <= now,
                Promotion.end_at >= now,
            )
        elif display_status == PromotionDisplayStatus.EXPIRED:
            stmt = stmt.where(Promotion.status == PromotionStatus.PUBLISHED, Promotion.end_at < now)

        stmt = stmt.distinct()
        total = (await self.session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

        stmt = (
            stmt.options(selectinload(Promotion.branches), selectinload(Promotion.products))
            .order_by(Promotion.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def list_active_candidates(self, store_id: int, store_branch_id: int, product_id: int) -> list[Promotion]:
        """Every PUBLISHED promotion covering this exact (branch, product) pair -- callers
        narrow to the currently-active one via `resolver.select_effective_promotion`."""
        result = await self.session.execute(
            select(Promotion)
            .join(PromotionBranch, PromotionBranch.promotion_id == Promotion.id)
            .join(PromotionProduct, PromotionProduct.promotion_id == Promotion.id)
            .where(
                Promotion.store_id == store_id,
                Promotion.status == PromotionStatus.PUBLISHED,
                PromotionBranch.store_branch_id == store_branch_id,
                PromotionProduct.product_id == product_id,
            )
        )
        return list(result.scalars().all())


class PromotionBranchRepository(BaseRepository[PromotionBranch]):
    model = PromotionBranch

    async def replace_for_promotion(self, promotion_id: int, branch_ids: list[int]) -> None:
        await self.session.execute(delete(PromotionBranch).where(PromotionBranch.promotion_id == promotion_id))
        for branch_id in set(branch_ids):
            self.session.add(PromotionBranch(promotion_id=promotion_id, store_branch_id=branch_id))
        await self.session.flush()


class PromotionProductRepository(BaseRepository[PromotionProduct]):
    model = PromotionProduct

    async def replace_for_promotion(self, promotion_id: int, product_ids: list[int]) -> None:
        await self.session.execute(delete(PromotionProduct).where(PromotionProduct.promotion_id == promotion_id))
        for product_id in set(product_ids):
            self.session.add(PromotionProduct(promotion_id=promotion_id, product_id=product_id))
        await self.session.flush()
