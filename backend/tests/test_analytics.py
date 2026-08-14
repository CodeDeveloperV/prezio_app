"""Epic 13: personal analytics (backend/app/features/analytics).

Exercises the metrics built on top of Epic 13's store attribution (see
test_store_attribution.py) and Epic 9's checked-item snapshot (see test_dashboard.py):
spend by store/category, most-used store (session-based), monthly evolution, favorite products,
and personal basket inflation -- plus privacy (no cross-user leakage) and that current prices
never retroactively affect historical spend.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Category, Product
from app.features.pricing.models import StoreProduct
from app.features.shopping_lists.models import ShoppingListItem
from app.features.stores.models import Store, StoreBranch

CREDENTIALS = {"email": "shopper@example.com", "password": "s3cret123"}
OTHER_CREDENTIALS = {"email": "other-shopper@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient, credentials: dict = CREDENTIALS) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def seed_store_branch(async_client: AsyncClient, *, store_name: str, branch_name: str) -> tuple[int, int]:
    """Returns (store_id, branch_id)."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name=store_name, country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name=branch_name, city="Panamá")
        session.add(branch)
        await session.commit()
        return store.id, branch.id


async def seed_product(
    async_client: AsyncClient, *, name: str, category_name: str | None = None, branch_id: int | None = None, price: str = "1.00"
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        category_id = None
        if category_name is not None:
            category = Category(name=category_name)
            session.add(category)
            await session.flush()
            category_id = category.id
        product = Product(canonical_name=name, category_id=category_id)
        session.add(product)
        await session.flush()
        if branch_id is not None:
            session.add(StoreProduct(store_branch_id=branch_id, product_id=product.id, current_price=Decimal(price)))
        await session.commit()
        return product.id


async def create_list(async_client: AsyncClient, token: str) -> int:
    response = await async_client.post(
        "/shopping-lists", json={"name": "Compra"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def set_active_branch(async_client: AsyncClient, token: str, shopping_list_id: int, branch_id: int | None) -> None:
    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


async def add_and_check_item(
    async_client: AsyncClient,
    token: str,
    shopping_list_id: int,
    product_id: int,
    *,
    quantity: int = 1,
    checked_at: datetime | None = None,
) -> dict:
    add_response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": quantity},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert add_response.status_code == 201
    item = add_response.json()

    check_response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "checked": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert check_response.status_code == 200
    checked_item = check_response.json()

    if checked_at is not None:
        session_factory = async_client.session_factory  # type: ignore[attr-defined]
        async with session_factory() as session:
            db_item = await session.get(ShoppingListItem, checked_item["id"])
            assert db_item is not None
            db_item.checked_at = checked_at
            await session.commit()
        checked_item["checked_at"] = checked_at.isoformat()

    return checked_item


async def get_analytics_summary(async_client: AsyncClient, token: str, *, period: str = "all", **params: object) -> dict:
    query = {"period": period, **params}
    response = await async_client.get(
        "/analytics/summary", params=query, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    return response.json()


async def test_spend_by_store_excludes_unattributed_and_ranks_by_chain(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_a = await seed_store_branch(async_client, store_name="Super 99", branch_name="Super 99 - Centro")
    product_a = await seed_product(async_client, name="Arroz", branch_id=branch_a, price="2.00")
    product_b = await seed_product(async_client, name="Frijoles")  # no branch listing -> checked with no active branch

    list_a = await create_list(async_client, token)
    await set_active_branch(async_client, token, list_a, branch_a)
    await add_and_check_item(async_client, token, list_a, product_a, quantity=2)  # 4.00 at Super 99

    list_b = await create_list(async_client, token)  # no active branch set
    await add_and_check_item(async_client, token, list_b, product_b, quantity=1)  # unattributed

    summary = await get_analytics_summary(async_client, token)

    by_chain = summary["spend_by_store"]["by_chain"]
    assert len(by_chain) == 1
    assert by_chain[0]["store_name"] == "Super 99"
    assert by_chain[0]["total_spent"] == "4.00"
    assert summary["spend_by_store"]["meta"]["unattributed_store_count"] == 1


async def test_most_used_store_counts_purchase_sessions_not_items(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_x = await seed_store_branch(async_client, store_name="Store X", branch_name="X - Sucursal 1")
    _, branch_y = await seed_store_branch(async_client, store_name="Store Y", branch_name="Y - Sucursal 1")
    product = await seed_product(async_client, name="Producto genérico", branch_id=branch_x, price="1.00")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(StoreProduct(store_branch_id=branch_y, product_id=product, current_price=Decimal("1.00")))
        await session.commit()

    now = datetime.now(timezone.utc)

    # Store X: 5 items, all checked the same day -> 1 session.
    list_x = await create_list(async_client, token)
    await set_active_branch(async_client, token, list_x, branch_x)
    for _ in range(5):
        await add_and_check_item(async_client, token, list_x, product, checked_at=now)

    # Store Y: 2 items, checked on 2 different days -> 2 sessions.
    list_y = await create_list(async_client, token)
    await set_active_branch(async_client, token, list_y, branch_y)
    await add_and_check_item(async_client, token, list_y, product, checked_at=now - timedelta(days=1))
    await add_and_check_item(async_client, token, list_y, product, checked_at=now - timedelta(days=2))

    summary = await get_analytics_summary(async_client, token)

    assert summary["most_used_store"]["store_name"] == "Store Y"
    assert summary["most_used_store"]["session_count"] == 2


async def test_spend_by_category_correct(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    dairy = await seed_product(async_client, name="Leche", category_name="Lácteos", branch_id=branch_id, price="3.00")
    produce = await seed_product(async_client, name="Manzana", category_name="Frutas y Verduras", branch_id=branch_id, price="1.50")

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    await add_and_check_item(async_client, token, shopping_list, dairy, quantity=2)  # 6.00
    await add_and_check_item(async_client, token, shopping_list, produce, quantity=4)  # 6.00

    summary = await get_analytics_summary(async_client, token)

    totals = {c["category_name"]: c["total_spent"] for c in summary["spend_by_category"]["categories"]}
    assert totals == {"Lácteos": "6.00", "Frutas y Verduras": "6.00"}


async def test_monthly_spend_correct_and_flags_current_month_partial(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    product = await seed_product(async_client, name="Café", branch_id=branch_id, price="5.00")

    now = datetime.now(timezone.utc)
    previous_month = (now.replace(day=1) - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    await add_and_check_item(async_client, token, shopping_list, product, quantity=1, checked_at=now)
    await add_and_check_item(async_client, token, shopping_list, product, quantity=2, checked_at=previous_month)

    summary = await get_analytics_summary(async_client, token)

    months = {(m["year"], m["month"]): m for m in summary["monthly_evolution"]["months"]}
    assert months[(now.year, now.month)]["total_spent"] == "5.00"
    assert months[(now.year, now.month)]["is_partial"] is True
    assert months[(previous_month.year, previous_month.month)]["total_spent"] == "10.00"
    assert months[(previous_month.year, previous_month.month)]["is_partial"] is False


async def test_favorite_products_ranked_by_purchase_frequency_not_quantity(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    frequent = await seed_product(async_client, name="Huevos", branch_id=branch_id, price="2.00")
    bulky = await seed_product(async_client, name="Papel higiénico", branch_id=branch_id, price="1.00")

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    # Bought 3 separate times (quantity 1 each) -> purchase_count=3, total_quantity=3.
    for _ in range(3):
        await add_and_check_item(async_client, token, shopping_list, frequent, quantity=1)
    # Bought once with a large quantity -> purchase_count=1, total_quantity=10.
    await add_and_check_item(async_client, token, shopping_list, bulky, quantity=10)

    summary = await get_analytics_summary(async_client, token)

    favorites = summary["favorite_products"]["products"]
    assert favorites[0]["product_name"] == "Huevos"
    assert favorites[0]["purchase_count"] == 3
    assert favorites[1]["product_name"] == "Papel higiénico"
    assert favorites[1]["total_quantity"] == 10


async def test_personal_inflation_with_sufficient_history(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    now = datetime.now(timezone.utc)
    older = now - timedelta(days=300)  # inside the older half of a 12-month (360-day) window

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)

    for name, old_price, new_price in [
        ("Arroz", "1.00", "1.10"),
        ("Frijoles", "2.00", "2.20"),
        ("Aceite", "3.00", "3.30"),
    ]:
        session_factory = async_client.session_factory  # type: ignore[attr-defined]
        async with session_factory() as session:
            product = Product(canonical_name=name)
            session.add(product)
            await session.flush()
            session.add(StoreProduct(store_branch_id=branch_id, product_id=product.id, current_price=Decimal(new_price)))
            await session.commit()
            product_id = product.id

        # Older-half purchase at the old price, recent-half purchase at the (10% higher) new price.
        old_item = await add_and_check_item(async_client, token, shopping_list, product_id, checked_at=older)
        session_factory = async_client.session_factory  # type: ignore[attr-defined]
        async with session_factory() as session:
            db_item = await session.get(ShoppingListItem, old_item["id"])
            assert db_item is not None
            db_item.price_at_check = Decimal(old_price)
            await session.commit()
        await add_and_check_item(async_client, token, shopping_list, product_id, checked_at=now)

    summary = await get_analytics_summary(async_client, token, inflation_window_months=12)

    inflation = summary["personal_inflation"]
    assert inflation["has_sufficient_data"] is True
    assert inflation["sample_size"] == 3
    assert inflation["personal_inflation_percentage"] == pytest_approx(10.0)


async def test_personal_inflation_without_sufficient_history_returns_no_percentage(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    product = await seed_product(async_client, name="Café", branch_id=branch_id, price="5.00")

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    # Only one purchase overall -- no product has history in both halves of the window.
    await add_and_check_item(async_client, token, shopping_list, product, quantity=1)

    summary = await get_analytics_summary(async_client, token, inflation_window_months=12)

    inflation = summary["personal_inflation"]
    assert inflation["has_sufficient_data"] is False
    assert inflation["personal_inflation_percentage"] is None


async def test_analytics_never_includes_another_users_data(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    product = await seed_product(async_client, name="Café", branch_id=branch_id, price="5.00")

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    await add_and_check_item(async_client, token, shopping_list, product, quantity=1)

    other_token = await get_access_token(async_client, OTHER_CREDENTIALS)
    other_summary = await get_analytics_summary(async_client, other_token)

    assert other_summary["total_spend"]["total_spent"] == "0"
    assert other_summary["favorite_products"]["products"] == []

    own_summary = await get_analytics_summary(async_client, token)
    assert own_summary["total_spend"]["total_spent"] == "5.00"


async def test_current_price_change_never_alters_historical_spend(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_store_branch(async_client, store_name="Super 99", branch_name="Centro")
    product = await seed_product(async_client, name="Café", branch_id=branch_id, price="2.00")

    shopping_list = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list, branch_id)
    await add_and_check_item(async_client, token, shopping_list, product, quantity=1)

    # Simulate a later price change at the branch -- must not retroactively change past spend.
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(StoreProduct).where(StoreProduct.product_id == product))
        db_store_product = result.scalar_one()
        db_store_product.current_price = Decimal("9.00")
        await session.commit()

    summary = await get_analytics_summary(async_client, token)
    assert summary["total_spend"]["total_spent"] == "2.00"


def pytest_approx(value: float, tolerance: float = 0.01) -> object:
    class _Approx:
        def __eq__(self, other: object) -> bool:
            return isinstance(other, (int, float)) and abs(other - value) <= tolerance

    return _Approx()
