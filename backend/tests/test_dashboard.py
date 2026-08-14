from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Product
from app.features.pricing.models import PriceHistory, StoreProduct
from app.features.shopping_lists.models import ShoppingListItem
from app.features.stores.models import Store, StoreBranch

CREDENTIALS = {"email": "shopper@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient, credentials: dict = CREDENTIALS) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def seed_priced_product(async_client: AsyncClient, *, price: str = "2.50") -> tuple[int, int, int]:
    """Creates a store/branch/product/store_product; returns (product_id, store_product_id, branch_id)."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name="Super 99 - Costa del Este", city="Panamá")
        session.add(branch)
        product = Product(canonical_name="Leche entera 1L")
        session.add(product)
        await session.flush()
        store_product = StoreProduct(store_branch_id=branch.id, product_id=product.id, current_price=Decimal(price))
        session.add(store_product)
        await session.commit()
        return product.id, store_product.id, branch.id


async def create_list(async_client: AsyncClient, token: str) -> int:
    response = await async_client.post(
        "/shopping-lists", json={"name": "Compra semanal"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def set_active_branch(async_client: AsyncClient, token: str, shopping_list_id: int, store_branch_id: int | None) -> None:
    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": store_branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


async def add_and_check_item(
    async_client: AsyncClient, token: str, shopping_list_id: int, product_id: int, quantity: int = 1
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
    return check_response.json()


async def get_dashboard_summary(async_client: AsyncClient, token: str) -> dict:
    response = await async_client.get("/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    return response.json()


async def test_dashboard_summary_empty_for_user_with_no_purchases(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)

    summary = await get_dashboard_summary(async_client, token)

    assert summary["current_month"]["total_spent"] == "0"
    assert summary["current_month"]["total_savings"] == "0"
    assert summary["most_purchased_products"] == []
    assert summary["last_purchase"] is None
    assert summary["monthly_budget"] is None
    assert summary["remaining_budget"] is None
    assert len(summary["monthly_history"]) == 6


async def test_checking_an_item_snapshots_active_branch_price_and_feeds_the_dashboard(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    product_id, _, branch_id = await seed_priced_product(async_client, price="2.50")
    shopping_list_id = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list_id, branch_id)

    checked_item = await add_and_check_item(async_client, token, shopping_list_id, product_id, quantity=3)
    assert checked_item["price_at_check"] == "2.50"
    assert checked_item["checked_at"] is not None
    assert checked_item["store_branch_id"] == branch_id

    summary = await get_dashboard_summary(async_client, token)

    assert summary["current_month"]["total_spent"] == "7.50"
    assert summary["most_purchased_products"] == [
        {"product_id": product_id, "product_name": "Leche entera 1L", "total_quantity": 3}
    ]
    assert summary["last_purchase"]["product_id"] == product_id
    assert summary["last_purchase"]["quantity"] == 3
    assert summary["last_purchase"]["price_at_check"] == "2.50"


async def test_price_at_check_uses_active_branch_price_not_cheapest_store(async_client: AsyncClient) -> None:
    """Epic 13: price_at_check must reflect the real price at the list's active branch, never the
    cheapest price across any store -- even when a cheaper listing exists elsewhere."""
    token = await get_access_token(async_client)
    product_id, _, branch_id = await seed_priced_product(async_client, price="3.00")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(Store).limit(1))
        store = result.scalar_one()
        cheaper_branch = StoreBranch(store_id=store.id, name="Sucursal más barata", city="Panamá")
        session.add(cheaper_branch)
        await session.flush()
        session.add(StoreProduct(store_branch_id=cheaper_branch.id, product_id=product_id, current_price=Decimal("1.75")))
        await session.commit()

    shopping_list_id = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list_id, branch_id)
    checked_item = await add_and_check_item(async_client, token, shopping_list_id, product_id)

    assert checked_item["price_at_check"] == "3.00"


async def test_checking_an_item_with_no_active_branch_leaves_price_at_check_null(async_client: AsyncClient) -> None:
    """No active branch selected -> no real branch price to snapshot, so price_at_check must be
    null rather than falling back to a guessed cheapest-store price."""
    token = await get_access_token(async_client)
    product_id, _, _branch_id = await seed_priced_product(async_client, price="2.50")
    shopping_list_id = await create_list(async_client, token)

    checked_item = await add_and_check_item(async_client, token, shopping_list_id, product_id)

    assert checked_item["price_at_check"] is None
    assert checked_item["store_branch_id"] is None


async def test_dashboard_separates_current_and_previous_month_spend(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    product_id, _, branch_id = await seed_priced_product(async_client, price="5.00")
    shopping_list_id = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list_id, branch_id)

    current_item = await add_and_check_item(async_client, token, shopping_list_id, product_id, quantity=1)
    backdated_item = await add_and_check_item(async_client, token, shopping_list_id, product_id, quantity=2)

    now = datetime.now(timezone.utc)
    previous_month_date = (now.replace(day=1) - timedelta(days=1)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        item = await session.get(ShoppingListItem, backdated_item["id"])
        assert item is not None
        item.checked_at = previous_month_date
        await session.commit()

    summary = await get_dashboard_summary(async_client, token)

    assert summary["current_month"]["total_spent"] == "5.00"
    assert summary["previous_month"]["total_spent"] == "10.00"
    assert current_item["id"] != backdated_item["id"]


async def test_dashboard_computes_savings_against_recent_price_history(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    product_id, store_product_id, branch_id = await seed_priced_product(async_client, price="4.00")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            PriceHistory(
                store_product_id=store_product_id,
                previous_price=Decimal("8.00"),
                new_price=Decimal("8.00"),
                updated_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()

    shopping_list_id = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list_id, branch_id)
    await add_and_check_item(async_client, token, shopping_list_id, product_id, quantity=1)

    summary = await get_dashboard_summary(async_client, token)

    # Reference price is the highest recent price_history entry (8.00); paid 4.00 -> saved 4.00.
    assert summary["current_month"]["total_savings"] == "4.00"


async def test_budget_endpoint_and_dashboard_remaining_budget(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    product_id, _, branch_id = await seed_priced_product(async_client, price="20.00")
    shopping_list_id = await create_list(async_client, token)
    await set_active_branch(async_client, token, shopping_list_id, branch_id)
    await add_and_check_item(async_client, token, shopping_list_id, product_id, quantity=1)

    budget_response = await async_client.patch(
        "/users/me/budget",
        json={"monthly_budget": "100.00"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert budget_response.status_code == 200
    assert budget_response.json()["monthly_budget"] == "100.00"

    summary = await get_dashboard_summary(async_client, token)

    assert summary["monthly_budget"] == "100.00"
    assert summary["current_month"]["total_spent"] == "20.00"
    assert summary["remaining_budget"] == "80.00"


async def test_budget_can_be_cleared_back_to_null(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)

    await async_client.patch(
        "/users/me/budget",
        json={"monthly_budget": "50.00"},
        headers={"Authorization": f"Bearer {token}"},
    )
    clear_response = await async_client.patch(
        "/users/me/budget",
        json={"monthly_budget": None},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert clear_response.status_code == 200
    assert clear_response.json()["monthly_budget"] is None

    summary = await get_dashboard_summary(async_client, token)
    assert summary["monthly_budget"] is None
    assert summary["remaining_budget"] is None
