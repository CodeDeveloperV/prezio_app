import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.alerts.dependencies import build_price_alert_evaluator
from app.features.catalog.models import Category, Product
from app.features.notifications.models import Notification
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch
from app.features.users.models import User

ALERT_CREDENTIALS = {"email": "alerts@example.com", "password": "s3cret123"}
OTHER_CREDENTIALS = {"email": "other-alerts@example.com", "password": "s3cret123"}

FRESH = datetime.now(timezone.utc)
STALE = datetime.now(timezone.utc) - timedelta(days=30)


async def get_access_token(async_client: AsyncClient, credentials: dict = ALERT_CREDENTIALS) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def get_user_id(async_client: AsyncClient, email: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        return result.scalar_one().id


async def seed_catalog(async_client: AsyncClient) -> tuple[int, int, int]:
    """Returns (store_id, branch_id, product_id) for a single default branch."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()

        branch = StoreBranch(store_id=store.id, name="Branch A", city="Ciudad de Panamá")
        session.add(branch)

        category = Category(name="Snacks")
        session.add(category)
        await session.flush()

        product = Product(canonical_name="Nutella 350g", category_id=category.id)
        session.add(product)
        await session.flush()
        await session.commit()
        return store.id, branch.id, product.id


async def seed_store_product(
    async_client: AsyncClient, branch_id: int, product_id: int, price: str, *, verified_at: datetime | None
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store_product = StoreProduct(
            store_branch_id=branch_id,
            product_id=product_id,
            current_price=price,
            last_verified_at=verified_at,
        )
        session.add(store_product)
        await session.commit()
        await session.refresh(store_product)
        return store_product.id


async def set_store_product_price(
    async_client: AsyncClient, store_product_id: int, price: str, *, verified_at: datetime | None
) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store_product = await session.get(StoreProduct, store_product_id)
        store_product.current_price = price
        store_product.last_verified_at = verified_at
        await session.commit()


async def run_evaluator(async_client: AsyncClient) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        evaluator = build_price_alert_evaluator(session)
        return await evaluator.run_once()


async def count_notifications(async_client: AsyncClient) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(Notification))
        return len(list(result.scalars().all()))


async def create_alert(
    async_client: AsyncClient,
    headers: dict,
    *,
    product_id: int,
    target_price: str,
    store_id: int | None = None,
    store_branch_id: int | None = None,
) -> dict:
    response = await async_client.post(
        "/alerts",
        json={
            "product_id": product_id,
            "target_price": target_price,
            "store_id": store_id,
            "store_branch_id": store_branch_id,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_first_crossing_below_target_creates_a_notification(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    alert = await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    triggered = await run_evaluator(async_client)

    assert triggered == 1
    assert await count_notifications(async_client) == 1

    alerts = (await async_client.get("/alerts", headers=headers)).json()
    updated = next(a for a in alerts if a["id"] == alert["id"])
    assert updated["is_below_threshold"] is True
    assert updated["last_triggered_at"] is not None


async def test_still_below_next_cycle_does_not_duplicate(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    await run_evaluator(async_client)
    second_pass_triggered = await run_evaluator(async_client)

    assert second_pass_triggered == 0
    assert await count_notifications(async_client) == 1


async def test_price_back_above_target_rearms_the_alert(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    store_product_id = await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    alert = await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    await run_evaluator(async_client)

    await set_store_product_price(async_client, store_product_id, "6.00", verified_at=FRESH)
    triggered = await run_evaluator(async_client)

    assert triggered == 0
    assert await count_notifications(async_client) == 1  # unchanged

    alerts = (await async_client.get("/alerts", headers=headers)).json()
    updated = next(a for a in alerts if a["id"] == alert["id"])
    assert updated["is_below_threshold"] is False


async def test_falling_again_after_rearm_notifies_a_second_time(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    store_product_id = await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    await run_evaluator(async_client)  # first trigger
    await set_store_product_price(async_client, store_product_id, "6.00", verified_at=FRESH)
    await run_evaluator(async_client)  # rearm
    await set_store_product_price(async_client, store_product_id, "4.00", verified_at=FRESH)
    triggered = await run_evaluator(async_client)  # second trigger

    assert triggered == 1
    assert await count_notifications(async_client) == 2


async def test_two_simultaneous_evaluators_only_notify_once(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    results = await asyncio.gather(run_evaluator(async_client), run_evaluator(async_client))

    assert sum(results) == 1
    assert await count_notifications(async_client) == 1


async def test_deactivated_alert_is_not_evaluated(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=FRESH)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    alert = await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    patch_response = await async_client.patch(f"/alerts/{alert['id']}", json={"active": False}, headers=headers)
    assert patch_response.status_code == 200

    triggered = await run_evaluator(async_client)

    assert triggered == 0
    assert await count_notifications(async_client) == 0


async def test_stale_price_does_not_trigger(async_client: AsyncClient) -> None:
    _, branch_id, product_id = await seed_catalog(async_client)
    await seed_store_product(async_client, branch_id, product_id, "4.50", verified_at=STALE)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    triggered = await run_evaluator(async_client)

    assert triggered == 0
    assert await count_notifications(async_client) == 0


async def test_product_scope_alert_triggers_from_any_branch(async_client: AsyncClient) -> None:
    store_id, branch_id, product_id = await seed_catalog(async_client)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        other_branch = StoreBranch(store_id=store_id, name="Branch B", city="Ciudad de Panamá")
        session.add(other_branch)
        await session.commit()
        await session.refresh(other_branch)

    await seed_store_product(async_client, branch_id, product_id, "10.00", verified_at=FRESH)
    await seed_store_product(async_client, other_branch.id, product_id, "4.00", verified_at=FRESH)

    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    triggered = await run_evaluator(async_client)

    assert triggered == 1


async def test_store_scoped_alert_ignores_other_stores(async_client: AsyncClient) -> None:
    store_id, branch_id, product_id = await seed_catalog(async_client)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        other_store = Store(name="Rey", country="PA")
        session.add(other_store)
        await session.flush()
        other_branch = StoreBranch(store_id=other_store.id, name="Rey Branch", city="Ciudad de Panamá")
        session.add(other_branch)
        await session.commit()
        await session.refresh(other_branch)

    # This store's branch stays above target; the cheaper price lives at a different chain
    # entirely and must not count towards a store_id-scoped alert.
    await seed_store_product(async_client, branch_id, product_id, "10.00", verified_at=FRESH)
    await seed_store_product(async_client, other_branch.id, product_id, "1.00", verified_at=FRESH)

    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(async_client, headers, product_id=product_id, target_price="5.00", store_id=store_id)

    triggered = await run_evaluator(async_client)

    assert triggered == 0


async def test_store_branch_scoped_alert_ignores_other_branches_of_the_same_store(
    async_client: AsyncClient,
) -> None:
    store_id, branch_id, product_id = await seed_catalog(async_client)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        other_branch = StoreBranch(store_id=store_id, name="Branch B", city="Ciudad de Panamá")
        session.add(other_branch)
        await session.commit()
        await session.refresh(other_branch)

    await seed_store_product(async_client, branch_id, product_id, "10.00", verified_at=FRESH)
    await seed_store_product(async_client, other_branch.id, product_id, "1.00", verified_at=FRESH)

    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    await create_alert(
        async_client, headers, product_id=product_id, target_price="5.00", store_branch_id=branch_id
    )

    triggered = await run_evaluator(async_client)

    assert triggered == 0


async def test_create_alert_rejects_both_store_id_and_store_branch_id(async_client: AsyncClient) -> None:
    store_id, branch_id, product_id = await seed_catalog(async_client)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await async_client.post(
        "/alerts",
        json={
            "product_id": product_id,
            "target_price": "5.00",
            "store_id": store_id,
            "store_branch_id": branch_id,
        },
        headers=headers,
    )

    assert response.status_code == 400


async def test_create_alert_with_unknown_product_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await async_client.post(
        "/alerts", json={"product_id": 999, "target_price": "5.00"}, headers=headers
    )

    assert response.status_code == 404


async def test_user_cannot_update_or_delete_another_users_alert(async_client: AsyncClient) -> None:
    _, _, product_id = await seed_catalog(async_client)
    owner_token = await get_access_token(async_client, ALERT_CREDENTIALS)
    other_token = await get_access_token(async_client, OTHER_CREDENTIALS)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    alert = await create_alert(async_client, owner_headers, product_id=product_id, target_price="5.00")

    update_response = await async_client.patch(
        f"/alerts/{alert['id']}", json={"target_price": "1.00"}, headers=other_headers
    )
    delete_response = await async_client.delete(f"/alerts/{alert['id']}", headers=other_headers)

    assert update_response.status_code == 403
    assert delete_response.status_code == 403


async def test_delete_alert_removes_it_from_the_owners_list(async_client: AsyncClient) -> None:
    _, _, product_id = await seed_catalog(async_client)
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    alert = await create_alert(async_client, headers, product_id=product_id, target_price="5.00")

    delete_response = await async_client.delete(f"/alerts/{alert['id']}", headers=headers)
    assert delete_response.status_code == 204

    alerts = (await async_client.get("/alerts", headers=headers)).json()
    assert all(a["id"] != alert["id"] for a in alerts)
