from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.repository import ProductRepository
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.models import OrganizationMember
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.enums import StoreProductStatus
from app.features.pricing.repository import StoreProductRepository
from app.features.promotions.enums import PromotionDisplayStatus, PromotionStatus, PromotionType
from app.features.promotions.exceptions import PromotionNotEditable, PromotionNotFound, PromotionNotPublishable
from app.features.promotions.models import Promotion
from app.features.promotions.repository import (
    PromotionBranchRepository,
    PromotionProductRepository,
    PromotionRepository,
)
from app.features.promotions.resolver import (
    compute_effective_price,
    default_priority_for_type,
    derive_display_status,
    select_effective_promotion,
)
from app.features.promotions.schemas import (
    EffectivePromotionRead,
    PromotionCreate,
    PromotionListItemRead,
    PromotionListRead,
    PromotionRead,
    PromotionUpdate,
)


class PromotionService:
    """Promotions is a domain separate from Pricing (Fase 10.9 spec): it never mutates
    `StoreProduct.current_price` or writes `PriceHistory`. Every modify/publish/cancel
    requires the actor to be authorized over *every* branch the promotion covers -- an
    ORGANIZATION_ADMIN always qualifies within their org; a MANAGER must have explicit access
    to each one, so a promotion can never be partially edited by someone outside its full
    branch scope.
    """

    def __init__(
        self,
        db: AsyncSession,
        promotions: PromotionRepository,
        promotion_branches: PromotionBranchRepository,
        promotion_products: PromotionProductRepository,
        membership: OrganizationMembershipService,
        products: ProductRepository,
        store_products: StoreProductRepository,
    ) -> None:
        self.db = db
        self.promotions = promotions
        self.promotion_branches = promotion_branches
        self.promotion_products = promotion_products
        self.membership = membership
        self.products = products
        self.store_products = store_products

    async def list_promotions(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        name: str | None = None,
        status: PromotionStatus | None = None,
        type: PromotionType | None = None,
        branch_id: int | None = None,
        product_id: int | None = None,
        display_status: PromotionDisplayStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PromotionListRead:
        now = _now()
        branch_ids: list[int] | None = None
        if branch_id is not None:
            await self.membership.authorize_branch(store_id, member, branch_id)
            branch_ids = [branch_id]
        elif member.role != OrganizationRole.ORGANIZATION_ADMIN:
            # MANAGER/EMPLOYEE only ever see promotions covering a branch they have access to.
            accessible = await self.membership.list_branches(store_id, member)
            branch_ids = [b.id for b in accessible]

        promotions, total = await self.promotions.list_paginated(
            store_id,
            now=now,
            name=name,
            status=status,
            type=type,
            branch_ids=branch_ids,
            product_id=product_id,
            display_status=display_status,
            page=page,
            page_size=page_size,
        )
        items = [self._to_list_item(p, now=now) for p in promotions]
        return PromotionListRead(items=items, total=total, page=page, page_size=page_size)

    async def get_promotion(self, store_id: int, member: OrganizationMember, promotion_id: int) -> PromotionRead:
        promotion = await self._get_owned(store_id, promotion_id)
        await self._authorize_all_branches(store_id, member, promotion)
        return self._to_read(promotion, now=_now())

    async def create_promotion(
        self, store_id: int, member: OrganizationMember, payload: PromotionCreate, user_id: int
    ) -> PromotionRead:
        await self._authorize_branch_ids(store_id, member, payload.branch_ids)
        await self._validate_product_ids(payload.product_ids)

        promotion = Promotion(
            store_id=store_id,
            name=payload.name,
            description=payload.description,
            type=payload.type,
            status=PromotionStatus.DRAFT,
            priority=payload.priority
            if payload.priority is not None
            else default_priority_for_type(payload.type),
            percentage_value=payload.percentage_value,
            fixed_discount_value=payload.fixed_discount_value,
            special_price=payload.special_price,
            buy_quantity=payload.buy_quantity,
            pay_quantity=payload.pay_quantity,
            start_at=payload.start_at,
            end_at=payload.end_at,
            created_by=user_id,
            updated_by=user_id,
        )
        await self.promotions.add(promotion)
        await self.promotion_branches.replace_for_promotion(promotion.id, payload.branch_ids)
        await self.promotion_products.replace_for_promotion(promotion.id, payload.product_ids)
        await self.db.commit()

        promotion = await self._get_owned(store_id, promotion.id)
        return self._to_read(promotion, now=_now())

    async def update_promotion(
        self,
        store_id: int,
        member: OrganizationMember,
        promotion_id: int,
        payload: PromotionUpdate,
        user_id: int,
    ) -> PromotionRead:
        promotion = await self._get_owned(store_id, promotion_id)
        await self._authorize_all_branches(store_id, member, promotion)
        if promotion.status != PromotionStatus.DRAFT:
            raise PromotionNotEditable("Only a draft promotion can be edited")

        await self._authorize_branch_ids(store_id, member, payload.branch_ids)
        await self._validate_product_ids(payload.product_ids)

        promotion.name = payload.name
        promotion.description = payload.description
        promotion.type = payload.type
        promotion.priority = (
            payload.priority if payload.priority is not None else default_priority_for_type(payload.type)
        )
        promotion.percentage_value = payload.percentage_value
        promotion.fixed_discount_value = payload.fixed_discount_value
        promotion.special_price = payload.special_price
        promotion.buy_quantity = payload.buy_quantity
        promotion.pay_quantity = payload.pay_quantity
        promotion.start_at = payload.start_at
        promotion.end_at = payload.end_at
        promotion.updated_by = user_id

        await self.promotion_branches.replace_for_promotion(promotion.id, payload.branch_ids)
        await self.promotion_products.replace_for_promotion(promotion.id, payload.product_ids)
        await self.db.commit()

        promotion = await self._get_owned(store_id, promotion_id)
        return self._to_read(promotion, now=_now())

    async def publish_promotion(
        self, store_id: int, member: OrganizationMember, promotion_id: int, user_id: int
    ) -> PromotionRead:
        promotion = await self._get_owned(store_id, promotion_id)
        await self._authorize_all_branches(store_id, member, promotion)
        if promotion.status != PromotionStatus.DRAFT:
            raise PromotionNotEditable("Only a draft promotion can be published")

        branch_ids = [b.store_branch_id for b in promotion.branches]
        product_ids = [p.product_id for p in promotion.products]
        if not branch_ids:
            raise PromotionNotPublishable("At least one branch must be selected")
        if not product_ids:
            raise PromotionNotPublishable("At least one product must be selected")

        listings = await self.store_products.list_by_branches_and_products(branch_ids, product_ids)
        active_pairs = {
            (listing.store_branch_id, listing.product_id)
            for listing in listings
            if listing.status == StoreProductStatus.ACTIVE
        }
        is_fully_covered = all(
            (branch_id, product_id) in active_pairs for branch_id in branch_ids for product_id in product_ids
        )
        if not is_fully_covered:
            raise PromotionNotPublishable(
                "Every selected product must be an active listing at every selected branch"
            )

        now = _now()
        promotion.status = PromotionStatus.PUBLISHED
        promotion.published_by = user_id
        promotion.published_at = now
        promotion.updated_by = user_id
        await self.db.commit()

        promotion = await self._get_owned(store_id, promotion_id)
        return self._to_read(promotion, now=now)

    async def cancel_promotion(
        self, store_id: int, member: OrganizationMember, promotion_id: int, user_id: int
    ) -> PromotionRead:
        promotion = await self._get_owned(store_id, promotion_id)
        await self._authorize_all_branches(store_id, member, promotion)
        if promotion.status != PromotionStatus.PUBLISHED:
            raise PromotionNotEditable("Only a published promotion can be cancelled")

        now = _now()
        promotion.status = PromotionStatus.CANCELLED
        promotion.cancelled_by = user_id
        promotion.cancelled_at = now
        promotion.updated_by = user_id
        await self.db.commit()

        promotion = await self._get_owned(store_id, promotion_id)
        return self._to_read(promotion, now=now)

    async def delete_promotion(self, store_id: int, member: OrganizationMember, promotion_id: int) -> None:
        """Only an unused (no products/branches attached) DRAFT may be deleted -- anything
        else should be cancelled instead, to keep the audit trail intact."""
        promotion = await self._get_owned(store_id, promotion_id)
        await self._authorize_all_branches(store_id, member, promotion)
        if promotion.status != PromotionStatus.DRAFT:
            raise PromotionNotEditable("Only a draft promotion can be deleted")
        if promotion.branches or promotion.products:
            raise PromotionNotEditable("Only an unused draft (no branches or products) can be deleted")

        await self.promotions.delete(promotion)
        await self.db.commit()

    async def get_effective_promotion(
        self, store_id: int, store_branch_id: int, product_id: int, base_price: Decimal
    ) -> EffectivePromotionRead | None:
        """Not wired to any HTTP endpoint in Fase 10.9 -- exists so a future consumer (mobile
        product display, receipts, etc.) can resolve "what promotion actually applies here"
        without duplicating the overlap-resolution logic. Never auto-stacks overlapping
        promotions; see `resolver.select_effective_promotion`."""
        candidates = await self.promotions.list_active_candidates(store_id, store_branch_id, product_id)
        chosen = select_effective_promotion(candidates, now=_now())
        if chosen is None:
            return None
        if chosen.type == PromotionType.BUY_X_GET_Y:
            return EffectivePromotionRead(
                promotion_id=chosen.id,
                type=chosen.type,
                effective_unit_price=None,
                buy_quantity=chosen.buy_quantity,
                pay_quantity=chosen.pay_quantity,
            )
        return EffectivePromotionRead(
            promotion_id=chosen.id,
            type=chosen.type,
            effective_unit_price=compute_effective_price(chosen, base_price),
            buy_quantity=None,
            pay_quantity=None,
        )

    async def _get_owned(self, store_id: int, promotion_id: int) -> Promotion:
        promotion = await self.promotions.get_by_id(promotion_id)
        if promotion is None or promotion.store_id != store_id:
            raise PromotionNotFound(promotion_id)
        return promotion

    async def _authorize_branch_ids(self, store_id: int, member: OrganizationMember, branch_ids: list[int]) -> None:
        for branch_id in branch_ids:
            await self.membership.authorize_branch(store_id, member, branch_id)

    async def _authorize_all_branches(self, store_id: int, member: OrganizationMember, promotion: Promotion) -> None:
        await self._authorize_branch_ids(store_id, member, [b.store_branch_id for b in promotion.branches])

    async def _validate_product_ids(self, product_ids: list[int]) -> None:
        if not product_ids:
            return
        found = await self.products.list_by_ids(product_ids)
        found_ids = {p.id for p in found}
        missing = [pid for pid in product_ids if pid not in found_ids]
        if missing:
            raise ProductNotFound(missing[0])

    def _to_read(self, promotion: Promotion, *, now: datetime) -> PromotionRead:
        return PromotionRead(
            id=promotion.id,
            store_id=promotion.store_id,
            name=promotion.name,
            description=promotion.description,
            type=promotion.type,
            status=promotion.status,
            display_status=derive_display_status(promotion, now=now),
            priority=promotion.priority,
            percentage_value=promotion.percentage_value,
            fixed_discount_value=promotion.fixed_discount_value,
            special_price=promotion.special_price,
            buy_quantity=promotion.buy_quantity,
            pay_quantity=promotion.pay_quantity,
            start_at=promotion.start_at,
            end_at=promotion.end_at,
            branch_ids=[b.store_branch_id for b in promotion.branches],
            product_ids=[p.product_id for p in promotion.products],
            created_by=promotion.created_by,
            updated_by=promotion.updated_by,
            published_by=promotion.published_by,
            published_at=promotion.published_at,
            cancelled_by=promotion.cancelled_by,
            cancelled_at=promotion.cancelled_at,
            created_at=promotion.created_at,
            updated_at=promotion.updated_at,
        )

    def _to_list_item(self, promotion: Promotion, *, now: datetime) -> PromotionListItemRead:
        return PromotionListItemRead(
            id=promotion.id,
            name=promotion.name,
            type=promotion.type,
            status=promotion.status,
            display_status=derive_display_status(promotion, now=now),
            priority=promotion.priority,
            start_at=promotion.start_at,
            end_at=promotion.end_at,
            branch_ids=[b.store_branch_id for b in promotion.branches],
            product_ids=[p.product_id for p in promotion.products],
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)
