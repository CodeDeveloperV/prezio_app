import logging

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.redis import get_redis
from app.features.auth.dependencies import get_current_user
from app.features.b2b_analytics.repository import B2BAnalyticsRepository
from app.features.b2b_analytics.service import B2BAnalyticsService
from app.features.catalog.repository import BrandRepository, CategoryRepository, ProductRepository
from app.features.catalog.service import CatalogService
from app.features.coupons.repository import CouponBranchRepository, CouponProductRepository, CouponRepository
from app.features.coupons.service import CouponService
from app.features.organizations.catalog_service import B2BCatalogService
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization
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
from app.features.reports.repository import ReportRepository
from app.features.reports.service import ReportService
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.service import ReputationService
from app.features.stores.repository import StoreBranchRepository, StoreRepository
from app.features.users.models import User
from app.features.users.repository import UserRepository

logger = logging.getLogger(__name__)


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
        CatalogService(CategoryRepository(db), ProductRepository(db), StoreProductRepository(db), BrandRepository(db)),
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
        CatalogService(CategoryRepository(db), ProductRepository(db), StoreProductRepository(db), BrandRepository(db)),
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


def get_report_service(
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> ReportService:
    return ReportService(
        db,
        ReportRepository(db),
        membership,
        ProductRepository(db),
        StoreProductRepository(db),
        StoreBranchRepository(db),
    )


def get_b2b_analytics_service(
    db: AsyncSession = Depends(get_db),
    membership: OrganizationMembershipService = Depends(get_membership_service),
) -> B2BAnalyticsService:
    settings = get_settings()
    return B2BAnalyticsService(
        B2BAnalyticsRepository(db),
        membership,
        StoreProductRepository(db),
        settings.price_freshness_days,
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
            logger.warning(
                "Authorization denied: member=%d role=%s store_id=%d requires one of %s",
                member.id,
                member.role,
                member.store_id,
                [r.value for r in roles],
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return member

    return _dependency


def require_branch_access(branch_id_param: str = "branch_id"):
    """Dependency factory: reads `branch_id_param` from the route's path params, since the
    param name varies per router (e.g. `branch_id` vs `store_branch_id`).

    Always validates the branch belongs to `store_id` first (else `InvalidBranchForOrganization`,
    surfaced as 400) -- an ORGANIZATION_ADMIN is authorized for every branch of *its own*
    organization, not for a branch belonging to a different one. MANAGER/EMPLOYEE additionally
    need an explicit `OrganizationMemberBranch` grant (else `BranchAccessDenied`, surfaced as 403).
    """

    async def _dependency(
        request: Request,
        store_id: int,
        member: OrganizationMember = Depends(require_organization_member),
        service: OrganizationMembershipService = Depends(get_membership_service),
    ) -> OrganizationMember:
        raw_branch_id = request.path_params.get(branch_id_param)
        if raw_branch_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this branch")
        try:
            await service.authorize_branch(store_id, member, int(raw_branch_id))
        except InvalidBranchForOrganization as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Branch does not belong to this organization"
            ) from exc
        except BranchAccessDenied as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this branch") from exc
        return member

    return _dependency
