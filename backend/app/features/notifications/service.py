from sqlalchemy.ext.asyncio import AsyncSession

from app.features.notifications.enums import NotificationType
from app.features.notifications.exceptions import NotificationAccessDenied, NotificationNotFound
from app.features.notifications.models import Notification
from app.features.notifications.repository import NotificationRepository


class NotificationService:
    def __init__(self, db: AsyncSession, notifications: NotificationRepository) -> None:
        self.db = db
        self.notifications = notifications

    async def list_for_user(
        self, user_id: int, *, unread_only: bool = False, limit: int = 50, offset: int = 0
    ) -> list[Notification]:
        return await self.notifications.list_for_user(user_id, unread_only=unread_only, limit=limit, offset=offset)

    async def mark_read(self, notification_id: int, requesting_user_id: int) -> Notification:
        notification = await self.notifications.get_by_id(notification_id)
        if notification is None:
            raise NotificationNotFound(notification_id)
        if notification.user_id != requesting_user_id:
            raise NotificationAccessDenied(notification_id)

        updated = await self.notifications.mark_read(notification_id)
        assert updated is not None
        await self.db.commit()
        return updated

    async def mark_all_read(self, user_id: int) -> int:
        marked = await self.notifications.mark_all_read(user_id)
        await self.db.commit()
        return marked

    async def create(
        self,
        *,
        user_id: int,
        type: NotificationType,
        title: str,
        message: str,
        related_entity_type: str | None = None,
        related_entity_id: int | None = None,
        alert_id: int | None = None,
        metadata: dict | None = None,
    ) -> Notification:
        """Used by other features (e.g. the price-alert evaluator) to push an inbox entry.

        Does not commit -- callers that create a notification as part of a larger unit of work
        (e.g. "claim the alert trigger, then notify") control the transaction boundary.
        """
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            alert_id=alert_id,
            metadata_json=metadata,
        )
        return await self.notifications.add(notification)
