from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.notifications.exceptions import NotificationAccessDenied, NotificationNotFound
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.schemas import MarkAllReadResponse, NotificationRead
from app.features.notifications.service import NotificationService
from app.features.users.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_notification_service(db: AsyncSession = Depends(get_db)) -> NotificationService:
    return NotificationService(db, NotificationRepository(db))


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> list[NotificationRead]:
    notifications = await service.list_for_user(
        current_user.id, unread_only=unread_only, limit=limit, offset=offset
    )
    return [NotificationRead.model_validate(n) for n in notifications]


@router.patch("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> MarkAllReadResponse:
    marked = await service.mark_all_read(current_user.id)
    return MarkAllReadResponse(marked_read=marked)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationRead:
    try:
        updated = await service.mark_read(notification_id, current_user.id)
    except NotificationNotFound as exc:
        raise HTTPException(404, "Notification not found") from exc
    except NotificationAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this notification") from exc

    return NotificationRead.model_validate(updated)
