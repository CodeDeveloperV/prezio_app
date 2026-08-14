from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.analytics.enums import AnalyticsPeriod
from app.features.analytics.repository import AnalyticsRepository
from app.features.analytics.schemas import AnalyticsSummary
from app.features.analytics.service import AnalyticsService
from app.features.auth.dependencies import get_current_user
from app.features.users.models import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


def get_analytics_service(db: AsyncSession = Depends(get_db)) -> AnalyticsService:
    return AnalyticsService(AnalyticsRepository(db))


@router.get("/summary", response_model=AnalyticsSummary)
async def get_analytics_summary(
    period: AnalyticsPeriod = Query(default=AnalyticsPeriod.LAST_3_MONTHS),
    inflation_window_months: int = Query(default=12, ge=2, le=36),
    current_user: User = Depends(get_current_user),
    service: AnalyticsService = Depends(get_analytics_service),
) -> AnalyticsSummary:
    # user_id is always derived from the authenticated user, never a client-supplied parameter --
    # personal analytics must not be requestable for another user (Epic 13 spec item 13).
    return await service.get_summary(
        current_user.id, period=period, inflation_window_months=inflation_window_months
    )
