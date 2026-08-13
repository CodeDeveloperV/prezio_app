from decimal import Decimal

from sqlalchemy import select

from app.features.users.models import User, UserProfile
from app.shared.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_google_id(self, google_id: str) -> User | None:
        result = await self.session.execute(select(User).where(User.google_id == google_id))
        return result.scalar_one_or_none()


class UserProfileRepository(BaseRepository[UserProfile]):
    model = UserProfile

    async def get_by_user_id(self, user_id: int) -> UserProfile | None:
        result = await self.session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        return result.scalar_one_or_none()

    async def set_monthly_budget(self, user_id: int, monthly_budget: Decimal | None) -> UserProfile:
        """No code creates a `UserProfile` row today (see UserService/UserProfile -- both were
        unwired dead code before this feature), so setting a budget is the first thing that ever
        upserts one."""
        profile = await self.get_by_user_id(user_id)
        if profile is None:
            profile = UserProfile(user_id=user_id, monthly_budget=monthly_budget)
            await self.add(profile)
        else:
            profile.monthly_budget = monthly_budget
            await self.session.flush()
        return profile
