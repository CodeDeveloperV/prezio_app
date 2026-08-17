from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.repository import ProductRepository
from app.features.coupons.enums import CouponDisplayStatus, CouponStatus, CouponType
from app.features.coupons.exceptions import (
    CouponCodeAlreadyExists,
    CouponNotEditable,
    CouponNotFound,
    CouponNotPublishable,
    CouponPermissionDenied,
)
from app.features.coupons.models import Coupon
from app.features.coupons.repository import CouponBranchRepository, CouponProductRepository, CouponRepository
from app.features.coupons.resolver import derive_display_status, normalize_code
from app.features.coupons.schemas import (
    CouponCreate,
    CouponListItemRead,
    CouponListRead,
    CouponRead,
    CouponUpdate,
)
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.models import OrganizationMember
from app.features.organizations.service import OrganizationMembershipService


class CouponService:
    """Coupon is a domain separate from Promotion (Fase 10.10 spec): a new table, no reuse of
    `promotions`, no FK between the two. Only ORGANIZATION_ADMIN may create/edit/publish/
    cancel/delete a coupon -- MANAGER/EMPLOYEE are strictly read-only, scoped to coupons that
    apply to their accessible branches (or to every branch of the org). This is deliberately
    stricter than Promotions and is enforced here, not just at the router dependency, so a
    direct request can't bypass it.
    """

    def __init__(
        self,
        db: AsyncSession,
        coupons: CouponRepository,
        coupon_branches: CouponBranchRepository,
        coupon_products: CouponProductRepository,
        membership: OrganizationMembershipService,
        products: ProductRepository,
    ) -> None:
        self.db = db
        self.coupons = coupons
        self.coupon_branches = coupon_branches
        self.coupon_products = coupon_products
        self.membership = membership
        self.products = products

    async def list_coupons(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        name: str | None = None,
        status: CouponStatus | None = None,
        type: CouponType | None = None,
        branch_id: int | None = None,
        product_id: int | None = None,
        display_status: CouponDisplayStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> CouponListRead:
        now = _now()
        branch_ids: list[int] | None = None
        if branch_id is not None:
            await self.membership.authorize_branch(store_id, member, branch_id)
            branch_ids = [branch_id]
        elif member.role != OrganizationRole.ORGANIZATION_ADMIN:
            # MANAGER/EMPLOYEE only ever see coupons that apply to a branch they have access
            # to (org-wide coupons are always included by the repository query).
            accessible = await self.membership.list_branches(store_id, member)
            branch_ids = [b.id for b in accessible]

        coupons, total = await self.coupons.list_paginated(
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
        items = [self._to_list_item(c, now=now) for c in coupons]
        return CouponListRead(items=items, total=total, page=page, page_size=page_size)

    async def get_coupon(self, store_id: int, member: OrganizationMember, coupon_id: int) -> CouponRead:
        coupon = await self._get_owned(store_id, coupon_id)
        await self._authorize_visibility(store_id, member, coupon)
        return self._to_read(coupon, now=_now())

    async def create_coupon(
        self, store_id: int, member: OrganizationMember, payload: CouponCreate, user_id: int
    ) -> CouponRead:
        self._require_admin(member)
        normalized_code = normalize_code(payload.code)
        await self._ensure_code_available(store_id, normalized_code)
        await self._authorize_branch_ids(store_id, member, payload.branch_ids)
        await self._validate_product_ids(payload.product_ids)

        coupon = Coupon(
            store_id=store_id,
            name=payload.name,
            description=payload.description,
            code=payload.code.strip(),
            normalized_code=normalized_code,
            type=payload.type,
            status=CouponStatus.DRAFT,
            percentage_value=payload.percentage_value,
            fixed_amount_value=payload.fixed_amount_value,
            applies_to_entire_purchase=payload.applies_to_entire_purchase,
            applies_to_all_branches=payload.applies_to_all_branches,
            minimum_purchase_amount=payload.minimum_purchase_amount,
            maximum_discount_amount=payload.maximum_discount_amount,
            max_redemptions_total=payload.max_redemptions_total,
            max_redemptions_per_user=payload.max_redemptions_per_user,
            is_stackable=payload.is_stackable,
            start_at=payload.start_at,
            end_at=payload.end_at,
            created_by=user_id,
            updated_by=user_id,
        )
        await self.coupons.add(coupon)
        await self.coupon_branches.replace_for_coupon(coupon.id, payload.branch_ids)
        await self.coupon_products.replace_for_coupon(coupon.id, payload.product_ids)
        await self.db.commit()

        coupon = await self._get_owned(store_id, coupon.id)
        return self._to_read(coupon, now=_now())

    async def update_coupon(
        self,
        store_id: int,
        member: OrganizationMember,
        coupon_id: int,
        payload: CouponUpdate,
        user_id: int,
    ) -> CouponRead:
        self._require_admin(member)
        coupon = await self._get_owned(store_id, coupon_id)
        if coupon.status != CouponStatus.DRAFT:
            raise CouponNotEditable("Only a draft coupon can be edited")

        normalized_code = normalize_code(payload.code)
        await self._ensure_code_available(store_id, normalized_code, exclude_coupon_id=coupon.id)
        await self._authorize_branch_ids(store_id, member, payload.branch_ids)
        await self._validate_product_ids(payload.product_ids)

        coupon.name = payload.name
        coupon.description = payload.description
        coupon.code = payload.code.strip()
        coupon.normalized_code = normalized_code
        coupon.type = payload.type
        coupon.percentage_value = payload.percentage_value
        coupon.fixed_amount_value = payload.fixed_amount_value
        coupon.applies_to_entire_purchase = payload.applies_to_entire_purchase
        coupon.applies_to_all_branches = payload.applies_to_all_branches
        coupon.minimum_purchase_amount = payload.minimum_purchase_amount
        coupon.maximum_discount_amount = payload.maximum_discount_amount
        coupon.max_redemptions_total = payload.max_redemptions_total
        coupon.max_redemptions_per_user = payload.max_redemptions_per_user
        coupon.is_stackable = payload.is_stackable
        coupon.start_at = payload.start_at
        coupon.end_at = payload.end_at
        coupon.updated_by = user_id

        await self.coupon_branches.replace_for_coupon(coupon.id, payload.branch_ids)
        await self.coupon_products.replace_for_coupon(coupon.id, payload.product_ids)
        await self.db.commit()

        coupon = await self._get_owned(store_id, coupon_id)
        return self._to_read(coupon, now=_now())

    async def publish_coupon(
        self, store_id: int, member: OrganizationMember, coupon_id: int, user_id: int
    ) -> CouponRead:
        self._require_admin(member)
        coupon = await self._get_owned(store_id, coupon_id)
        if coupon.status != CouponStatus.DRAFT:
            raise CouponNotEditable("Only a draft coupon can be published")

        if not coupon.applies_to_all_branches and not coupon.branches:
            raise CouponNotPublishable("At least one branch must be selected")
        if not coupon.applies_to_entire_purchase and not coupon.products:
            raise CouponNotPublishable("At least one product must be selected")

        now = _now()
        coupon.status = CouponStatus.PUBLISHED
        coupon.published_by = user_id
        coupon.published_at = now
        coupon.updated_by = user_id
        await self.db.commit()

        coupon = await self._get_owned(store_id, coupon_id)
        return self._to_read(coupon, now=now)

    async def cancel_coupon(
        self, store_id: int, member: OrganizationMember, coupon_id: int, user_id: int
    ) -> CouponRead:
        self._require_admin(member)
        coupon = await self._get_owned(store_id, coupon_id)
        if coupon.status != CouponStatus.PUBLISHED:
            raise CouponNotEditable("Only a published coupon can be cancelled")

        now = _now()
        coupon.status = CouponStatus.CANCELLED
        coupon.cancelled_by = user_id
        coupon.cancelled_at = now
        coupon.updated_by = user_id
        await self.db.commit()

        coupon = await self._get_owned(store_id, coupon_id)
        return self._to_read(coupon, now=now)

    async def delete_coupon(self, store_id: int, member: OrganizationMember, coupon_id: int) -> None:
        """Only an unused (no products/branches attached) DRAFT may be hard-deleted -- anything
        that was ever published must be cancelled instead, to keep the audit trail intact."""
        self._require_admin(member)
        coupon = await self._get_owned(store_id, coupon_id)
        if coupon.status != CouponStatus.DRAFT:
            raise CouponNotEditable("Only a draft coupon can be deleted")
        if coupon.branches or coupon.products:
            raise CouponNotEditable("Only an unused draft (no branches or products) can be deleted")

        await self.coupons.delete(coupon)
        await self.db.commit()

    def _require_admin(self, member: OrganizationMember) -> None:
        if member.role != OrganizationRole.ORGANIZATION_ADMIN:
            raise CouponPermissionDenied("Only an organization admin can manage coupons")

    async def _get_owned(self, store_id: int, coupon_id: int) -> Coupon:
        coupon = await self.coupons.get_by_id(coupon_id)
        if coupon is None or coupon.store_id != store_id:
            raise CouponNotFound(coupon_id)
        return coupon

    async def _authorize_visibility(self, store_id: int, member: OrganizationMember, coupon: Coupon) -> None:
        """MANAGER/EMPLOYEE can only view a coupon that applies to every branch of the org or
        to at least one branch they have access to -- never one scoped entirely to branches
        outside their grant. Raises `CouponNotFound` (not a 403) so a coupon outside scope
        can't be distinguished from one that doesn't exist, matching the org-membership
        not-found convention used elsewhere."""
        if member.role == OrganizationRole.ORGANIZATION_ADMIN or coupon.applies_to_all_branches:
            return
        accessible = await self.membership.list_branches(store_id, member)
        accessible_ids = {b.id for b in accessible}
        if not any(b.store_branch_id in accessible_ids for b in coupon.branches):
            raise CouponNotFound(coupon.id)

    async def _authorize_branch_ids(self, store_id: int, member: OrganizationMember, branch_ids: list[int]) -> None:
        for branch_id in branch_ids:
            await self.membership.authorize_branch(store_id, member, branch_id)

    async def _validate_product_ids(self, product_ids: list[int]) -> None:
        if not product_ids:
            return
        found = await self.products.list_by_ids(product_ids)
        found_ids = {p.id for p in found}
        missing = [pid for pid in product_ids if pid not in found_ids]
        if missing:
            raise ProductNotFound(missing[0])

    async def _ensure_code_available(
        self, store_id: int, normalized_code: str, *, exclude_coupon_id: int | None = None
    ) -> None:
        existing = await self.coupons.get_by_normalized_code(store_id, normalized_code)
        if existing is not None and existing.id != exclude_coupon_id:
            raise CouponCodeAlreadyExists(normalized_code)

    def _to_read(self, coupon: Coupon, *, now: datetime) -> CouponRead:
        return CouponRead(
            id=coupon.id,
            store_id=coupon.store_id,
            name=coupon.name,
            description=coupon.description,
            code=coupon.code,
            type=coupon.type,
            status=coupon.status,
            display_status=derive_display_status(coupon, now=now),
            percentage_value=coupon.percentage_value,
            fixed_amount_value=coupon.fixed_amount_value,
            applies_to_entire_purchase=coupon.applies_to_entire_purchase,
            applies_to_all_branches=coupon.applies_to_all_branches,
            minimum_purchase_amount=coupon.minimum_purchase_amount,
            maximum_discount_amount=coupon.maximum_discount_amount,
            max_redemptions_total=coupon.max_redemptions_total,
            max_redemptions_per_user=coupon.max_redemptions_per_user,
            is_stackable=coupon.is_stackable,
            start_at=coupon.start_at,
            end_at=coupon.end_at,
            branch_ids=[b.store_branch_id for b in coupon.branches],
            product_ids=[p.product_id for p in coupon.products],
            created_by=coupon.created_by,
            updated_by=coupon.updated_by,
            published_by=coupon.published_by,
            published_at=coupon.published_at,
            cancelled_by=coupon.cancelled_by,
            cancelled_at=coupon.cancelled_at,
            created_at=coupon.created_at,
            updated_at=coupon.updated_at,
        )

    def _to_list_item(self, coupon: Coupon, *, now: datetime) -> CouponListItemRead:
        return CouponListItemRead(
            id=coupon.id,
            name=coupon.name,
            code=coupon.code,
            type=coupon.type,
            status=coupon.status,
            display_status=derive_display_status(coupon, now=now),
            percentage_value=coupon.percentage_value,
            fixed_amount_value=coupon.fixed_amount_value,
            applies_to_entire_purchase=coupon.applies_to_entire_purchase,
            applies_to_all_branches=coupon.applies_to_all_branches,
            max_redemptions_total=coupon.max_redemptions_total,
            max_redemptions_per_user=coupon.max_redemptions_per_user,
            start_at=coupon.start_at,
            end_at=coupon.end_at,
            branch_ids=[b.store_branch_id for b in coupon.branches],
            product_ids=[p.product_id for p in coupon.products],
            created_by=coupon.created_by,
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)
