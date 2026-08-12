from datetime import datetime, timezone

from sqlalchemy import func, select, update

from app.features.notifications.models import Notification
from app.shared.base_repository import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    async def list_for_user(
        self, user_id: int, *, unread_only: bool = False, limit: int = 50, offset: int = 0
    ) -> list[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))
        stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def mark_read(self, notification_id: int) -> Notification | None:
        notification = await self.get_by_id(notification_id)
        if notification is None:
            return None
        if notification.read_at is None:
            notification.read_at = datetime.now(timezone.utc)
            await self.session.flush()
        return notification

    async def mark_all_read(self, user_id: int) -> int:
        result = await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=func.now())
        )
        return result.rowcount
