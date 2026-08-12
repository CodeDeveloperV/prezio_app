import asyncio

from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.core.redis import get_redis
from app.features.catalog.models import Category, Product
from app.features.shopping_lists.models import ShoppingListMember
from app.features.users.models import User
from app.main import app
from app.shared.models_base import Base
from tests.conftest import FakeRedis

OWNER_CREDENTIALS = {"email": "owner@example.com", "password": "s3cret123"}
EDITOR_CREDENTIALS = {"email": "editor@example.com", "password": "s3cret123"}
OUTSIDER_CREDENTIALS = {"email": "outsider@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient, credentials: dict) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def get_user_id(async_client: AsyncClient, email: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        return result.scalar_one().id


async def seed_product(async_client: AsyncClient) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        category = Category(name="Lácteos")
        session.add(category)
        await session.flush()

        product = Product(canonical_name="Leche entera 1L", category_id=category.id, presentation="1L")
        session.add(product)
        await session.commit()
        return product.id


async def create_list(async_client: AsyncClient, owner_token: str, name: str = "Compra semanal") -> int:
    response = await async_client.post(
        "/shopping-lists", json={"name": name}, headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def invite_and_accept_as_editor(
    async_client: AsyncClient, owner_token: str, shopping_list_id: int
) -> tuple[str, int]:
    """Registers the editor, invites them by email, accepts, returns (editor_token, editor_user_id)."""
    editor_token = await get_access_token(async_client, EDITOR_CREDENTIALS)
    editor_user_id = await get_user_id(async_client, EDITOR_CREDENTIALS["email"])

    invite = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": EDITOR_CREDENTIALS["email"]},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert invite.status_code == 201
    invitation_id = invite.json()["id"]

    accept = await async_client.post(
        f"/invitations/{invitation_id}/accept",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert accept.status_code == 200
    return editor_token, editor_user_id


async def test_owner_creates_list_and_becomes_owner_member(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    owner_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    shopping_list_id = await create_list(async_client, owner_token)

    response = await async_client.get(
        f"/shopping-lists/{shopping_list_id}/members", headers={"Authorization": f"Bearer {owner_token}"}
    )

    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["user_id"] == owner_id
    assert members[0]["role"] == "owner"


async def test_cannot_duplicate_membership(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    owner_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    shopping_list_id = await create_list(async_client, owner_token)

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(ShoppingListMember(shopping_list_id=shopping_list_id, user_id=owner_id, role="owner"))
        try:
            await session.commit()
            duplicate_succeeded = True
        except Exception:
            await session.rollback()
            duplicate_succeeded = False

    assert duplicate_succeeded is False


async def test_editor_can_edit_items(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token, _ = await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)
    product_id = await seed_product(async_client)

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": 2},
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert add_response.status_code == 201
    item = add_response.json()

    update_response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "checked": True},
        headers={"Authorization": f"Bearer {editor_token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["checked"] is True


async def test_editor_cannot_delete_list(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token, _ = await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)

    response = await async_client.delete(
        f"/shopping-lists/{shopping_list_id}", headers={"Authorization": f"Bearer {editor_token}"}
    )

    assert response.status_code == 403


async def test_editor_cannot_remove_another_member(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    owner_id = await get_user_id(async_client, OWNER_CREDENTIALS["email"])
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token, _ = await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)

    response = await async_client.delete(
        f"/shopping-lists/{shopping_list_id}/members/{owner_id}",
        headers={"Authorization": f"Bearer {editor_token}"},
    )

    assert response.status_code == 403


async def test_external_user_cannot_view_list(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    outsider_token = await get_access_token(async_client, OUTSIDER_CREDENTIALS)

    response = await async_client.get(
        f"/shopping-lists/{shopping_list_id}", headers={"Authorization": f"Bearer {outsider_token}"}
    )

    assert response.status_code == 403


def test_external_user_cannot_subscribe_to_the_websocket() -> None:
    # websocket_connect needs TestClient's blocking portal, which only exists inside
    # `with TestClient(app) as client:` -- so this test can't use the async_client fixture and
    # instead wires up its own in-memory SQLite engine + FakeRedis, exactly like that fixture does.
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    asyncio.run(_create_all(engine))
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = lambda: FakeRedis()

    try:
        with TestClient(app) as client:
            owner_credentials = {"email": "ws-owner@example.com", "password": "s3cret123"}
            outsider_credentials = {"email": "ws-outsider@example.com", "password": "s3cret123"}

            client.post("/auth/register", json=owner_credentials)
            owner_token = client.post("/auth/login", json=owner_credentials).json()["access_token"]
            created = client.post(
                "/shopping-lists", json={"name": "WS list"}, headers={"Authorization": f"Bearer {owner_token}"}
            )
            shopping_list_id = created.json()["id"]

            client.post("/auth/register", json=outsider_credentials)
            outsider_token = client.post("/auth/login", json=outsider_credentials).json()["access_token"]

            with client.websocket_connect(f"/shopping-lists/ws?token={outsider_token}") as websocket:
                websocket.send_json({"action": "subscribe", "shopping_list_id": shopping_list_id})
                # Not authorized onto this topic: nothing is ever broadcast to this socket for it.
                # Sending a second, harmless message and getting no error/echo back is the signal
                # that the subscribe was silently rejected rather than granted.
                websocket.send_json({"action": "unsubscribe", "shopping_list_id": shopping_list_id})
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


async def _create_all(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def test_duplicate_pending_invitation_rejected(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)

    first = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": "invitee@example.com"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert first.status_code == 201

    second = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": "invitee@example.com"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert second.status_code == 409


async def test_existing_member_cannot_be_invited(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)

    response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": EDITOR_CREDENTIALS["email"]},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 400


async def test_accepting_invitation_creates_membership_exactly_once(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token, editor_user_id = await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(
            select(ShoppingListMember).where(
                ShoppingListMember.shopping_list_id == shopping_list_id,
                ShoppingListMember.user_id == editor_user_id,
            )
        )
        memberships = list(result.scalars().all())
    assert len(memberships) == 1

    # Re-fetch the (now accepted) invitation id to call accept again -- must stay idempotent.
    invitations = await async_client.get(
        "/invitations", headers={"Authorization": f"Bearer {editor_token}"}
    )
    assert invitations.json() == []  # no longer pending


async def test_decline_invitation_works(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token = await get_access_token(async_client, EDITOR_CREDENTIALS)

    invite = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": EDITOR_CREDENTIALS["email"]},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    invitation_id = invite.json()["id"]

    decline = await async_client.post(
        f"/invitations/{invitation_id}/decline", headers={"Authorization": f"Bearer {editor_token}"}
    )
    assert decline.status_code == 200
    assert decline.json()["status"] == "declined"

    # Idempotent: declining again doesn't error.
    decline_again = await async_client.post(
        f"/invitations/{invitation_id}/decline", headers={"Authorization": f"Bearer {editor_token}"}
    )
    assert decline_again.status_code == 200


async def test_revoke_invitation_works(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)

    invite = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/invitations",
        json={"invited_email": "invitee@example.com"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    invitation_id = invite.json()["id"]

    revoke = await async_client.post(
        f"/invitations/{invitation_id}/revoke", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert revoke.status_code == 200
    assert revoke.json()["status"] == "revoked"


async def test_update_item_with_correct_version_succeeds(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    product_id = await seed_product(async_client)

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": 1},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    item = add_response.json()

    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "quantity": 5},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 200
    assert response.json()["quantity"] == 5
    assert response.json()["version"] == item["version"] + 1


async def test_update_item_with_stale_version_returns_409(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    product_id = await seed_product(async_client)
    headers = {"Authorization": f"Bearer {owner_token}"}

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items", json={"product_id": product_id, "quantity": 1}, headers=headers
    )
    item = add_response.json()

    first_update = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "quantity": 2},
        headers=headers,
    )
    assert first_update.status_code == 200

    stale_update = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "quantity": 3},
        headers=headers,
    )

    assert stale_update.status_code == 409
    body = stale_update.json()
    assert body["item"]["version"] == item["version"] + 1
    assert body["item"]["quantity"] == 2


async def test_archived_list_rejects_modifications(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    product_id = await seed_product(async_client)
    headers = {"Authorization": f"Bearer {owner_token}"}

    archive_response = await async_client.post(f"/shopping-lists/{shopping_list_id}/archive", headers=headers)
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items", json={"product_id": product_id, "quantity": 1}, headers=headers
    )

    assert add_response.status_code == 403


async def test_websocket_event_published_after_mutation(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    product_id = await seed_product(async_client)

    await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": 1},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    fake_redis = async_client.fake_redis  # type: ignore[attr-defined]
    channels = [channel for channel, _ in fake_redis.published]
    assert f"shopping_list_updates:{shopping_list_id}" in channels


async def test_item_updated_event_includes_new_version(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    product_id = await seed_product(async_client)
    headers = {"Authorization": f"Bearer {owner_token}"}

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items", json={"product_id": product_id, "quantity": 1}, headers=headers
    )
    item = add_response.json()

    await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "checked": True},
        headers=headers,
    )

    fake_redis = async_client.fake_redis  # type: ignore[attr-defined]
    import json as json_module

    matching = [
        json_module.loads(message)
        for channel, message in fake_redis.published
        if channel == f"shopping_list_updates:{shopping_list_id}"
    ]
    item_updated_events = [event for event in matching if event["event_type"] == "item_updated"]
    assert len(item_updated_events) == 1
    assert item_updated_events[0]["version"] == item["version"] + 1


async def test_two_concurrent_users_editing_same_item_produce_conflict(async_client: AsyncClient) -> None:
    owner_token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, owner_token)
    editor_token, _ = await invite_and_accept_as_editor(async_client, owner_token, shopping_list_id)
    product_id = await seed_product(async_client)

    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": 1},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    item = add_response.json()

    async def submit(token: str, quantity: int) -> int:
        response = await async_client.patch(
            f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
            json={"version": item["version"], "quantity": quantity},
            headers={"Authorization": f"Bearer {token}"},
        )
        return response.status_code

    status_codes = await asyncio.gather(submit(owner_token, 2), submit(editor_token, 3))

    assert sorted(status_codes) == [200, 409]
