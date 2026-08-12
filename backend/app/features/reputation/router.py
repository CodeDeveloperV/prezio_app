from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.schemas import ReputationEventRead, UserReputationRead
from app.features.reputation.service import ReputationService, points_to_next_level
from app.features.users.models import User

router = APIRouter(prefix="/reputation", tags=["reputation"])


def get_reputation_service(db: AsyncSession = Depends(get_db)) -> ReputationService:
    return ReputationService(ReputationEventRepository(db))


@router.get("/users/{user_id}", response_model=UserReputationRead)
async def get_user_reputation(
    user_id: int,
    current_user: User = Depends(get_current_user),
    service: ReputationService = Depends(get_reputation_service),
) -> UserReputationRead:
    total_points = await service.get_total_points(user_id)
    return UserReputationRead(
        user_id=user_id,
        total_points=total_points,
        level=await service.get_level(user_id),
        points_to_next_level=points_to_next_level(total_points),
        auto_approval_enabled=await service.qualifies_for_auto_approval(user_id),
    )


@router.get("/users/{user_id}/events", response_model=list[ReputationEventRead])
async def list_user_reputation_events(
    user_id: int,
    current_user: User = Depends(get_current_user),
    service: ReputationService = Depends(get_reputation_service),
) -> list[ReputationEventRead]:
    """Activity feed backing "why is my reputation X" -- most recent first."""
    events = await service.events.list_by_user(user_id)
    return [ReputationEventRead.model_validate(e) for e in events]
