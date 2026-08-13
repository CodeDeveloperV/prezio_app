from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.users.models import User, UserProfile
from app.features.users.repository import UserProfileRepository, UserRepository


class UserService:
    def __init__(self, db: AsyncSession, repository: UserRepository, profiles: UserProfileRepository) -> None:
        self.db = db
        self.repository = repository
        self.profiles = profiles

    async def get_by_id(self, user_id: int) -> User | None:
        return await self.repository.get_by_id(user_id)

    async def set_monthly_budget(self, user_id: int, monthly_budget: Decimal | None) -> UserProfile:
        profile = await self.profiles.set_monthly_budget(user_id, monthly_budget)
        await self.db.commit()
        return profile
