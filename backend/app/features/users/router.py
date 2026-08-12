from fastapi import APIRouter, Depends

from app.features.auth.dependencies import get_current_user
from app.features.users.models import User
from app.features.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user
