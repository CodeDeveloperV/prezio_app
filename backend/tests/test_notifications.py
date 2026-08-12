from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import select

from app.features.notifications.enums import NotificationType
from app.features.notifications.models import Notification
from app.features.users.models import User

OWNER_CREDENTIALS = {"email": "notif-owner@example.com", "password": "s3cret123"}
OTHER_CREDENTIALS = {"email": "notif-other@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient, credentials: dict) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def seed_notification(
    async_client: AsyncClient, user_id: int, *, title: str = "Nutella bajó de precio", read: bool = False
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        notification = Notification(
            user_id=user_id,
            type=NotificationType.PRICE_ALERT,
            title=title,
            message="Nutella está a $4.50",
            alert_id=None,
            metadata_json={"price": "4.50"},
            read_at=datetime.now(timezone.utc) if read else None,
        )
        session.add(notification)
        await session.commit()
        await session.refresh(notification)
        return notification.id


async def get_user_id(async_client: AsyncClient, email: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        return result.scalar_one().id


async def test_list_notifications_orders_most_recent_first(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    user_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    headers = {"Authorization": f"Bearer {access_token}"}

    await seed_notification(async_client, user_id, title="First")
    await seed_notification(async_client, user_id, title="Second")

    response = await async_client.get("/notifications", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert [n["title"] for n in body] == ["Second", "First"]
    assert body[0]["metadata"] == {"price": "4.50"}


async def test_list_notifications_unread_only_filter(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    user_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    headers = {"Authorization": f"Bearer {access_token}"}

    await seed_notification(async_client, user_id, title="Read one", read=True)
    await seed_notification(async_client, user_id, title="Unread one", read=False)

    response = await async_client.get("/notifications", params={"unread_only": True}, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert [n["title"] for n in body] == ["Unread one"]


async def test_mark_notification_read(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    user_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    headers = {"Authorization": f"Bearer {access_token}"}
    notification_id = await seed_notification(async_client, user_id)

    response = await async_client.patch(f"/notifications/{notification_id}/read", headers=headers)

    assert response.status_code == 200
    assert response.json()["read_at"] is not None


async def test_mark_all_notifications_read(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    user_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    headers = {"Authorization": f"Bearer {access_token}"}
    await seed_notification(async_client, user_id, title="One")
    await seed_notification(async_client, user_id, title="Two")

    response = await async_client.patch("/notifications/read-all", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"marked_read": 2}

    unread = (
        await async_client.get("/notifications", params={"unread_only": True}, headers=headers)
    ).json()
    assert unread == []


async def test_user_cannot_mark_another_users_notification_read(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    other_token = await get_access_token(async_client, OTHER_CREDENTIALS)
    owner_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    other_headers = {"Authorization": f"Bearer {other_token}"}
    notification_id = await seed_notification(async_client, owner_id)

    response = await async_client.patch(f"/notifications/{notification_id}/read", headers=other_headers)

    assert response.status_code == 403


async def test_mark_unknown_notification_read_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await async_client.patch("/notifications/999/read", headers=headers)

    assert response.status_code == 404
