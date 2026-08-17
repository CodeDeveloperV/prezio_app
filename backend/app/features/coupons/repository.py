from datetime import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import selectinload

from app.features.coupons.enums import CouponDisplayStatus, CouponStatus, CouponType
from app.features.coupons.models import Coupon, CouponBranch, CouponProduct
from app.shared.base_repository import BaseRepository


class CouponRepository(BaseRepository[Coupon]):
    model = Coupon

    async def get_by_id(self, entity_id: int) -> Coupon | None:
        result = await self.session.execute(
            select(Coupon)
            .where(Coupon.id == entity_id)
            .options(selectinload(Coupon.branches), selectinload(Coupon.products))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_normalized_code(self, store_id: int, normalized_code: str) -> Coupon | None:
        result = await self.session.execute(
            select(Coupon).where(Coupon.store_id == store_id, Coupon.normalized_code == normalized_code)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        store_id: int,
        *,
        now: datetime,
        name: str | None = None,
        status: CouponStatus | None = None,
        type: CouponType | None = None,
        branch_ids: list[int] | None = None,
        product_id: int | None = None,
        display_status: CouponDisplayStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Coupon], int]:
        """`branch_ids`, when given, matches a coupon that either applies to every branch of
        the organization or explicitly covers ANY of those branches -- callers pass a single-
        element list for an exact filter, or the caller's full accessible-branch set to scope
        a MANAGER/EMPLOYEE's listing to their own branches."""
        stmt = select(Coupon).where(Coupon.store_id == store_id)
        if name:
            search = f"%{name.strip()}%"
            stmt = stmt.where(or_(Coupon.name.ilike(search), Coupon.normalized_code.ilike(search)))
        if status is not None:
            stmt = stmt.where(Coupon.status == status)
        if type is not None:
            stmt = stmt.where(Coupon.type == type)
        if branch_ids is not None:
            stmt = stmt.where(
                or_(
                    Coupon.applies_to_all_branches.is_(True),
                    Coupon.id.in_(
                        select(CouponBranch.coupon_id).where(CouponBranch.store_branch_id.in_(branch_ids))
                    ),
                )
            )
        if product_id is not None:
            stmt = stmt.where(
                or_(
                    Coupon.applies_to_entire_purchase.is_(True),
                    Coupon.id.in_(select(CouponProduct.coupon_id).where(CouponProduct.product_id == product_id)),
                )
            )

        if display_status == CouponDisplayStatus.DRAFT:
            stmt = stmt.where(Coupon.status == CouponStatus.DRAFT)
        elif display_status == CouponDisplayStatus.CANCELLED:
            stmt = stmt.where(Coupon.status == CouponStatus.CANCELLED)
        elif display_status == CouponDisplayStatus.SCHEDULED:
            stmt = stmt.where(Coupon.status == CouponStatus.PUBLISHED, Coupon.start_at > now)
        elif display_status == CouponDisplayStatus.ACTIVE:
            stmt = stmt.where(
                Coupon.status == CouponStatus.PUBLISHED, Coupon.start_at <= now, Coupon.end_at >= now
            )
        elif display_status == CouponDisplayStatus.EXPIRED:
            stmt = stmt.where(Coupon.status == CouponStatus.PUBLISHED, Coupon.end_at < now)

        total = (await self.session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

        stmt = (
            stmt.options(selectinload(Coupon.branches), selectinload(Coupon.products))
            .order_by(Coupon.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total


class CouponBranchRepository(BaseRepository[CouponBranch]):
    model = CouponBranch

    async def replace_for_coupon(self, coupon_id: int, branch_ids: list[int]) -> None:
        await self.session.execute(delete(CouponBranch).where(CouponBranch.coupon_id == coupon_id))
        for branch_id in set(branch_ids):
            self.session.add(CouponBranch(coupon_id=coupon_id, store_branch_id=branch_id))
        await self.session.flush()


class CouponProductRepository(BaseRepository[CouponProduct]):
    model = CouponProduct

    async def replace_for_coupon(self, coupon_id: int, product_ids: list[int]) -> None:
        await self.session.execute(delete(CouponProduct).where(CouponProduct.coupon_id == coupon_id))
        for product_id in set(product_ids):
            self.session.add(CouponProduct(coupon_id=coupon_id, product_id=product_id))
        await self.session.flush()
