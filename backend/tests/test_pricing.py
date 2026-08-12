import asyncio
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Category, Product
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch

PRICER_CREDENTIALS = {"email": "pricer@example.com", "password": "s3cret123"}


async def seed_store_product(async_client: AsyncClient, price: str = "2.50", version: int = 1) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()

        branch = StoreBranch(store_id=store.id, name="Super 99 - Test Branch", city="Ciudad de Panamá")
        session.add(branch)

        category = Category(name="Lácteos")
        session.add(category)
        await session.flush()

        product = Product(canonical_name="Leche entera 1L", category_id=category.id, presentation="1L")
        session.add(product)
        await session.flush()

        store_product = StoreProduct(
            store_branch_id=branch.id, product_id=product.id, current_price=price, version=version
        )
        session.add(store_product)
        await session.commit()
        await session.refresh(store_product)
        return store_product.id


async def get_access_token(async_client: AsyncClient) -> str:
    await async_client.post("/auth/register", json=PRICER_CREDENTIALS)
    login = await async_client.post("/auth/login", json=PRICER_CREDENTIALS)
    return login.json()["access_token"]


async def test_update_price_with_matching_version_succeeds(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client)
    access_token = await get_access_token(async_client)

    response = await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "2.75", "version": 1},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_price"] == "2.75"
    assert body["version"] == 2

    # A Redis message was published so WebSocket subscribers get the new price.
    fake_redis = async_client.fake_redis  # type: ignore[attr-defined]
    assert len(fake_redis.published) == 1
    channel, _message = fake_redis.published[0]
    assert channel == f"price_updates:{store_product_id}"


async def test_stale_version_is_rejected_with_current_server_state(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    # Simulates two clients that both read version=1 before either one writes: the
    # first update to reach the database wins outright.
    first_update = await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "2.75", "version": 1},
        headers=headers,
    )
    assert first_update.status_code == 200

    # The second client still holds the stale version=1 it originally read; its
    # `UPDATE ... WHERE version = 1` now matches zero rows since the row moved to
    # version 2, so it must be told to retry with the server's current state.
    second_update = await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "3.00", "version": 1},
        headers=headers,
    )

    assert second_update.status_code == 409
    conflict_body = second_update.json()
    assert conflict_body["current_price"] == "2.75"
    assert conflict_body["version"] == 2


async def test_two_concurrent_updates_only_one_succeeds(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    async def submit(price: str) -> int:
        response = await async_client.post(
            f"/pricing/store-products/{store_product_id}/price",
            json={"price": price, "version": 1},
            headers=headers,
        )
        return response.status_code

    status_codes = await asyncio.gather(submit("2.75"), submit("3.00"))

    # Exactly one of the two truly concurrent requests wins (200); the other loses
    # the race against the atomic `UPDATE ... WHERE version = 1` and gets 409.
    assert sorted(status_codes) == [200, 409]


async def test_update_unknown_store_product_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)

    response = await async_client.post(
        "/pricing/store-products/999/price",
        json={"price": "1.00", "version": 1},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


async def test_confirm_match_sets_last_verified_without_changing_price(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client)
    access_token = await get_access_token(async_client)

    response = await async_client.post(
        f"/pricing/store-products/{store_product_id}/confirm",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_price"] == "2.50"
    assert body["version"] == 1  # "✓ Coincide" never bumps version or writes PriceHistory
    assert body["last_verified_at"] is not None
    assert body["last_verified_by"] is not None


async def test_confirm_match_records_a_price_confirmation(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client, price="2.50")
    access_token = await get_access_token(async_client)

    await async_client.post(
        f"/pricing/store-products/{store_product_id}/confirm",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        from app.features.pricing.models import PriceConfirmation

        result = await session.execute(select(PriceConfirmation))
        confirmations = list(result.scalars().all())

    assert len(confirmations) == 1
    confirmation = confirmations[0]
    assert confirmation.store_product_id == store_product_id
    assert confirmation.confirmed_price == Decimal("2.50")
    assert confirmation.confirmed_at is not None
    assert confirmation.confirmed_by is not None
    assert confirmation.store_branch_id is not None


async def test_reputation_counts_confirmations_across_multiple_products(async_client: AsyncClient) -> None:
    sp1 = await seed_store_product(async_client, price="2.50")
    sp2 = await seed_store_product(async_client, price="4.00")
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    await async_client.post(f"/pricing/store-products/{sp1}/confirm", headers=headers)
    await async_client.post(f"/pricing/store-products/{sp2}/confirm", headers=headers)

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        from app.features.users.models import User

        result = await session.execute(select(User).where(User.email == PRICER_CREDENTIALS["email"]))
        user_id = result.scalar_one().id

    response = await async_client.get(f"/pricing/users/{user_id}/reputation", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"user_id": user_id, "correct_confirmations": 2}


async def test_reputation_is_zero_for_a_user_with_no_confirmations(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)

    response = await async_client.get(
        "/pricing/users/999/reputation", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": 999, "correct_confirmations": 0}


async def test_confirm_unknown_store_product_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)

    response = await async_client.post(
        "/pricing/store-products/999/confirm",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


async def test_price_history_lists_updates_most_recent_first(async_client: AsyncClient) -> None:
    store_product_id = await seed_store_product(async_client)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "2.75", "version": 1},
        headers=headers,
    )
    await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "3.00", "version": 2},
        headers=headers,
    )

    response = await async_client.get(
        f"/pricing/store-products/{store_product_id}/history", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["new_price"] == "3.00"
    assert body[1]["new_price"] == "2.75"
    # No UserProfile was created for this user, so display_name is null and the email fallback applies.
    assert body[0]["updated_by"] == {
        "user_id": body[0]["updated_by"]["user_id"],
        "display_name": None,
        "email": PRICER_CREDENTIALS["email"],
    }


async def test_price_history_unknown_store_product_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)

    response = await async_client.get(
        "/pricing/store-products/999/history",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404
