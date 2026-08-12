from app.features.users.models import User
from app.features.users.repository import UserRepository


class UserService:
    def __init__(self, repository: UserRepository) -> None:
        self.repository = repository

    async def get_by_id(self, user_id: int) -> User | None:
        return await self.repository.get_by_id(user_id)
