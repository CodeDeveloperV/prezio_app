from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.features.auth.dependencies import get_current_user
from app.features.catalog.repository import CategoryRepository, ProductRepository
from app.features.catalog.service import CatalogService
from app.features.coupons.repository import CouponBranchRepository, CouponProductRepository, CouponRepository
from app.features.coupons.service import CouponService
from app.features.organizations.catalog_service import B2BCatalogService
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.models import OrganizationMember
from app.features.organizations.pricing_service import B2BPricingService
from app.features.organizations.repository import OrganizationMemberBranchRepository, OrganizationMemberRepository
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.repository import PriceConfirmationRepository, PriceHistoryRepository, StoreProductRepository
from app.features.pricing.service import PricingService
from app.features.promotions.repository import (
    PromotionBranchRepository,
    PromotionProductRepository,
    PromotionRepository,
)
from app.features.promotions.service import PromotionService
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.service import ReputationService
from app.features.stores.repository import StoreBranchRepository, StoreRepository
from app.features.users.models import User
from app.features.users.repository import UserRepository


def get_membership_service(db: AsyncSession = Depends(get_db)) -> OrganizationMembershipService:
    return OrganizationMembershipService(
        db,
        OrganizationMemberRepository(db),
        OrganizationMemberBranchRepository(db),
        UserRepository(db),
        StoreRepository(db),
        StoreBranchRepository(db),
    )


def get_b2b_catalog_service(
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> B2BCatalogService:
    return B2BCatalogService(
        db,
        CatalogService(CategoryRepository(db), ProductRepository(db)),
        membership,
        StoreProductRepository(db),
    )


def get_b2b_pricing_service(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> B2BPricingService:
    return B2BPricingService(
        db,
        PricingService(
            db,
            StoreProductRepository(db),
            PriceHistoryRepository(db),
            PriceConfirmationRepository(db),
            redis,
            ReputationService(ReputationEventRepository(db)),
        ),
        membership,
        StoreProductRepository(db),
        PriceHistoryRepository(db),
        ProductRepository(db),
        CatalogService(CategoryRepository(db), ProductRepository(db)),
    )


def get_promotion_service(
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> PromotionService:
    return PromotionService(
        db,
        PromotionRepository(db),
        PromotionBranchRepository(db),
        PromotionProductRepository(db),
        membership,
        ProductRepository(db),
        StoreProductRepository(db),
    )


def get_coupon_service(
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> CouponService:
    return CouponService(
        db,
        CouponRepository(db),
        CouponBranchRepository(db),
        CouponProductRepository(db),
        membership,
        ProductRepository(db),
    )


async def require_organization_member(
    store_id: int,
    current_user: User = Depends(get_current_user),
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> OrganizationMember:
    """Resolves the caller's active membership for `store_id` (read from the URL path).

    Always 404s on no/inactive membership -- never distinguishes "organization doesn't
    exist" from "you have no access to it", so cross-tenant requests can't be used to
    probe which store IDs exist.
    """
    member = await service.get_active_membership(store_id, current_user.id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return member


def require_organization_role(*roles: OrganizationRole):
    async def _dependency(
        member: OrganizationMember = Depends(require_organization_member),
    ) -> OrganizationMember:
        if member.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return member

    return _dependency


def require_branch_access(branch_id_param: str = "branch_id"):
    """Dependency factory: reads `branch_id_param` from the route's path params, since the
    param name varies per router (e.g. `branch_id` vs `store_branch_id`).

    ORGANIZATION_ADMIN is authorized for every branch of its organization; MANAGER/EMPLOYEE
    need an explicit `OrganizationMemberBranch` grant.
    """

    async def _dependency(
        request: Request,
        member: OrganizationMember = Depends(require_organization_member),
        service: OrganizationMembershipService = Depends(get_membership_service),
    ) -> OrganizationMember:
        if member.role == OrganizationRole.ORGANIZATION_ADMIN:
            return member

        raw_branch_id = request.path_params.get(branch_id_param)
        if raw_branch_id is None or not await service.has_branch_access(member, int(raw_branch_id)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this branch")
        return member

    return _dependency
