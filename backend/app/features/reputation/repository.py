from sqlalchemy import func, select

from app.features.reputation.models import ReputationEvent
from app.shared.base_repository import BaseRepository


class ReputationEventRepository(BaseRepository[ReputationEvent]):
    model = ReputationEvent

    async def total_points(self, user_id: int) -> int:
        result = await self.session.execute(
            select(func.coalesce(func.sum(ReputationEvent.points), 0)).where(ReputationEvent.user_id == user_id)
        )
        return result.scalar_one()

    async def list_by_user(self, user_id: int) -> list[ReputationEvent]:
        result = await self.session.execute(
            select(ReputationEvent).where(ReputationEvent.user_id == user_id).order_by(ReputationEvent.id.desc())
        )
        return list(result.scalars().all())
