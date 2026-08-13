from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.users.models import User
from app.features.users.repository import UserProfileRepository, UserRepository
from app.features.users.schemas import UserBudgetRead, UserBudgetUpdate, UserRead
from app.features.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db, UserRepository(db), UserProfileRepository(db))


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me/budget", response_model=UserBudgetRead)
async def update_my_monthly_budget(
    payload: UserBudgetUpdate,
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service),
) -> UserBudgetRead:
    profile = await service.set_monthly_budget(current_user.id, payload.monthly_budget)
    return UserBudgetRead(monthly_budget=profile.monthly_budget)
