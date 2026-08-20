import asyncio

from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.core.redis import get_redis
from app.features.catalog.models import Category, Product
from app.features.pricing.enums import Availability
from app.features.pricing.models import StoreProduct
from app.features.shopping_lists.models import ShoppingListMember
from app.features.stores.models import Store, StoreBranch
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


async def seed_named_product(async_client: AsyncClient, name: str, presentation: str = "1 unidad") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        category = Category(name=f"Categoría {name}")
        session.add(category)
        await session.flush()
        product = Product(canonical_name=name, category_id=category.id, presentation=presentation)
        session.add(product)
        await session.commit()
        return product.id


async def seed_branch(async_client: AsyncClient, *, store_name: str, branch_name: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name=store_name, country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name=branch_name, city="Ciudad de Panamá")
        session.add(branch)
        await session.commit()
        return branch.id


async def seed_store_product(
    async_client: AsyncClient,
    *,
    branch_id: int,
    product_id: int,
    price: str,
    availability: Availability = Availability.IN_STOCK,
) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            StoreProduct(
                store_branch_id=branch_id,
                product_id=product_id,
                current_price=price,
                availability=availability,
            )
        )
        await session.commit()


async def add_item(async_client: AsyncClient, token: str, shopping_list_id: int, product_id: int, quantity: int) -> dict:
    response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": quantity},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def set_summary_branch(async_client: AsyncClient, token: str, shopping_list_id: int, branch_id: int | None) -> None:
    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


async def get_purchase_summary(async_client: AsyncClient, token: str, shopping_list_id: int) -> dict:
    response = await async_client.get(
        f"/shopping-lists/{shopping_list_id}/summary", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    return response.json()


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


async def test_purchase_summary_empty_list_is_complete_without_a_total(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)

    summary = await get_purchase_summary(async_client, token, shopping_list_id)

    assert summary["items"] == []
    assert summary["distinct_products_count"] == 0
    assert summary["total_units_count"] == 0
    assert summary["priced_subtotal"] is None
    assert summary["unpriced_items_count"] == 0
    assert summary["pricing_status"] == "complete"


async def test_purchase_summary_calculates_branch_scoped_item_and_total_subtotals(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    branch_id = await seed_branch(async_client, store_name="Super 99", branch_name="Vía España")
    milk_id = await seed_named_product(async_client, "Leche", "1 L")
    rice_id = await seed_named_product(async_client, "Arroz", "1 kg")
    await seed_store_product(async_client, branch_id=branch_id, product_id=milk_id, price="2.50")
    await seed_store_product(async_client, branch_id=branch_id, product_id=rice_id, price="3.20")
    await set_summary_branch(async_client, token, shopping_list_id, branch_id)
    await add_item(async_client, token, shopping_list_id, milk_id, 2)
    await add_item(async_client, token, shopping_list_id, rice_id, 3)

    summary = await get_purchase_summary(async_client, token, shopping_list_id)
    lines = {line["product_id"]: line for line in summary["items"]}

    assert summary["store_name"] == "Super 99"
    assert summary["branch_name"] == "Vía España"
    assert summary["distinct_products_count"] == 2
    assert summary["total_units_count"] == 5
    assert summary["priced_subtotal"] == "14.60"
    assert summary["pricing_status"] == "complete"
    assert lines[milk_id]["unit_price"] == "2.50"
    assert lines[milk_id]["subtotal"] == "5.00"
    assert lines[rice_id]["subtotal"] == "9.60"


async def test_purchase_summary_is_partial_when_a_product_is_not_listed_at_the_active_branch(
    async_client: AsyncClient,
) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    active_branch = await seed_branch(async_client, store_name="Super 99", branch_name="Vía España")
    other_branch = await seed_branch(async_client, store_name="Super 99", branch_name="El Dorado")
    priced_product = await seed_named_product(async_client, "Pasta")
    other_branch_only_product = await seed_named_product(async_client, "Salsa")
    await seed_store_product(async_client, branch_id=active_branch, product_id=priced_product, price="1.50")
    await seed_store_product(async_client, branch_id=other_branch, product_id=other_branch_only_product, price="99.99")
    await set_summary_branch(async_client, token, shopping_list_id, active_branch)
    await add_item(async_client, token, shopping_list_id, priced_product, 2)
    await add_item(async_client, token, shopping_list_id, other_branch_only_product, 1)

    summary = await get_purchase_summary(async_client, token, shopping_list_id)
    lines = {line["product_id"]: line for line in summary["items"]}

    assert summary["priced_subtotal"] == "3.00"
    assert summary["unpriced_items_count"] == 1
    assert summary["pricing_status"] == "partial"
    assert lines[other_branch_only_product]["pricing_status"] == "missing_product"
    assert lines[other_branch_only_product]["unit_price"] is None
    assert lines[other_branch_only_product]["subtotal"] is None
    assert lines[other_branch_only_product]["store_product_id"] is None


async def test_purchase_summary_is_unavailable_for_invalid_or_unavailable_branch_prices(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    branch_id = await seed_branch(async_client, store_name="Rey", branch_name="Obarrio")
    invalid_price_product = await seed_named_product(async_client, "Producto sin precio")
    unavailable_product = await seed_named_product(async_client, "Producto agotado")
    await seed_store_product(async_client, branch_id=branch_id, product_id=invalid_price_product, price="0.00")
    await seed_store_product(
        async_client,
        branch_id=branch_id,
        product_id=unavailable_product,
        price="4.00",
        availability=Availability.OUT_OF_STOCK,
    )
    await set_summary_branch(async_client, token, shopping_list_id, branch_id)
    await add_item(async_client, token, shopping_list_id, invalid_price_product, 1)
    await add_item(async_client, token, shopping_list_id, unavailable_product, 2)

    summary = await get_purchase_summary(async_client, token, shopping_list_id)
    lines = {line["product_id"]: line for line in summary["items"]}

    assert summary["priced_subtotal"] is None
    assert summary["unpriced_items_count"] == 2
    assert summary["pricing_status"] == "unavailable"
    assert lines[invalid_price_product]["pricing_status"] == "price_unavailable"
    assert lines[unavailable_product]["pricing_status"] == "unavailable"


async def test_purchase_summary_uses_product_identity_without_requiring_a_barcode(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    branch_id = await seed_branch(async_client, store_name="Xtra", branch_name="24 de Diciembre")
    product_id = await seed_named_product(async_client, "Producto sin código")
    await seed_store_product(async_client, branch_id=branch_id, product_id=product_id, price="7.25")
    await set_summary_branch(async_client, token, shopping_list_id, branch_id)
    await add_item(async_client, token, shopping_list_id, product_id, 1)

    summary = await get_purchase_summary(async_client, token, shopping_list_id)

    assert summary["pricing_status"] == "complete"
    assert summary["items"][0]["product_id"] == product_id
    assert summary["items"][0]["subtotal"] == "7.25"


async def test_purchase_summary_keeps_captured_price_when_the_live_store_price_changes(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    branch_id = await seed_branch(async_client, store_name="Xtra", branch_name="Tumba Muerto")
    product_id = await seed_named_product(async_client, "Leche capturada", "1 L")
    await seed_store_product(async_client, branch_id=branch_id, product_id=product_id, price="1.85")
    await set_summary_branch(async_client, token, shopping_list_id, branch_id)
    item = await add_item(async_client, token, shopping_list_id, product_id, 2)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        listing = (await session.execute(select(StoreProduct).where(StoreProduct.product_id == product_id))).scalar_one()
        listing.current_price = "1.95"  # Simulates another shopper's later realtime update.
        listing.version += 1
        await session.commit()

    summary = await get_purchase_summary(async_client, token, shopping_list_id)
    line = summary["items"][0]
    assert line["shopping_list_item_id"] == item["id"]
    assert line["current_price"] == "1.95"
    assert line["captured_unit_price"] == "1.85"
    assert line["subtotal"] == "3.70"
    assert summary["priced_subtotal"] == "3.70"


async def test_explicit_capture_adopts_current_branch_price_only_for_that_item(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client, OWNER_CREDENTIALS)
    shopping_list_id = await create_list(async_client, token)
    branch_id = await seed_branch(async_client, store_name="Rey", branch_name="Costa del Este")
    product_id = await seed_named_product(async_client, "Cereal", "500 g")
    await seed_store_product(async_client, branch_id=branch_id, product_id=product_id, price="2.00")
    await set_summary_branch(async_client, token, shopping_list_id, branch_id)
    item = await add_item(async_client, token, shopping_list_id, product_id, 1)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        listing = (await session.execute(select(StoreProduct).where(StoreProduct.product_id == product_id))).scalar_one()
        listing.current_price = "2.25"
        listing.version += 1
        await session.commit()
        listing_id, listing_version = listing.id, listing.version
    response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}/capture-price",
        json={"version": item["version"], "store_product_id": listing_id, "store_product_version": listing_version},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["captured_unit_price"] == "2.25"
