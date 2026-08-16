from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.features.b2b_analytics.schemas import (
    ActivityFeedRead,
    AvailabilityAnalyticsRead,
    CouponsAnalyticsRead,
    OverviewRead,
    PricingAnalyticsRead,
    PromotionsAnalyticsRead,
    ReportsAnalyticsRead,
)
from app.features.b2b_analytics.service import B2BAnalyticsService
from app.features.organizations.dependencies import get_b2b_analytics_service, require_organization_member
from app.features.organizations.models import OrganizationMember

router = APIRouter(prefix="/b2b", tags=["b2b-analytics"])


def _default_range(date_from: datetime | None, date_to: datetime | None) -> tuple[datetime, datetime]:
    """Defaults to the last 30 days when the caller omits the range -- every endpoint accepts
    an explicit range for the frontend's date presets (Today/Last 7 days/Last 30 days/This
    month/Previous month/Custom)."""
    resolved_to = date_to or datetime.now(timezone.utc)
    resolved_from = date_from or (resolved_to - timedelta(days=30))
    return resolved_from, resolved_to


@router.get("/organizations/{store_id}/analytics/overview", response_model=OverviewRead)
async def get_overview(
    store_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> OverviewRead:
    resolved_from, resolved_to = _default_range(date_from, date_to)
    return await service.get_overview(store_id, member, date_from=resolved_from, date_to=resolved_to, branch_ids=branch_ids)


@router.get("/organizations/{store_id}/analytics/pricing", response_model=PricingAnalyticsRead)
async def get_pricing_analytics(
    store_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> PricingAnalyticsRead:
    resolved_from, resolved_to = _default_range(date_from, date_to)
    return await service.get_pricing_analytics(
        store_id, member, date_from=resolved_from, date_to=resolved_to, branch_ids=branch_ids
    )


@router.get("/organizations/{store_id}/analytics/availability", response_model=AvailabilityAnalyticsRead)
async def get_availability_analytics(
    store_id: int,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> AvailabilityAnalyticsRead:
    return await service.get_availability_analytics(store_id, member, branch_ids=branch_ids)


@router.get("/organizations/{store_id}/analytics/promotions", response_model=PromotionsAnalyticsRead)
async def get_promotions_analytics(
    store_id: int,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> PromotionsAnalyticsRead:
    return await service.get_promotions_analytics(store_id, member, branch_ids=branch_ids)


@router.get("/organizations/{store_id}/analytics/coupons", response_model=CouponsAnalyticsRead)
async def get_coupons_analytics(
    store_id: int,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> CouponsAnalyticsRead:
    return await service.get_coupons_analytics(store_id, member, branch_ids=branch_ids)


@router.get("/organizations/{store_id}/analytics/reports", response_model=ReportsAnalyticsRead)
async def get_reports_analytics(
    store_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    branch_ids: list[int] | None = Query(default=None),
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> ReportsAnalyticsRead:
    resolved_from, resolved_to = _default_range(date_from, date_to)
    return await service.get_reports_analytics(
        store_id, member, date_from=resolved_from, date_to=resolved_to, branch_ids=branch_ids
    )


@router.get("/organizations/{store_id}/analytics/activity", response_model=ActivityFeedRead)
async def get_activity_feed(
    store_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    branch_ids: list[int] | None = Query(default=None),
    limit: int = 50,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BAnalyticsService = Depends(get_b2b_analytics_service),
) -> ActivityFeedRead:
    resolved_from, resolved_to = _default_range(date_from, date_to)
    return await service.get_activity_feed(
        store_id, member, date_from=resolved_from, date_to=resolved_to, branch_ids=branch_ids, limit=limit
    )
