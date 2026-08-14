"""Epic 13 (personal analytics): store attribution on purchases.

Covers ShoppingList.active_store_branch_id / ShoppingListItem.store_branch_id -- the
active-branch endpoint, the immutable snapshot taken at check time, and that price_at_check
always reflects that specific branch's real price (see ShoppingListService.set_active_branch,
.update_item, ._price_at_branch). Cheapest/most-common price behavior lived in
test_dashboard.py and was rewritten there once it became invalid under this feature.
"""

from decimal import Decimal

from httpx import AsyncClient

from app.features.catalog.models import Product
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch

CREDENTIALS = {"email": "shopper@example.com", "password": "s3cret123"}
OUTSIDER_CREDENTIALS = {"email": "outsider@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient, credentials: dict = CREDENTIALS) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def seed_branch_with_priced_product(async_client: AsyncClient, *, price: str = "2.50") -> tuple[int, int]:
    """Returns (product_id, branch_id)."""
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
        session.add(StoreProduct(store_branch_id=branch.id, product_id=product.id, current_price=Decimal(price)))
        await session.commit()
        return product.id, branch.id


async def create_list(async_client: AsyncClient, token: str) -> int:
    response = await async_client.post(
        "/shopping-lists", json={"name": "Compra semanal"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def add_item(async_client: AsyncClient, token: str, shopping_list_id: int, product_id: int) -> dict:
    response = await async_client.post(
        f"/shopping-lists/{shopping_list_id}/items",
        json={"product_id": product_id, "quantity": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def check_item(async_client: AsyncClient, token: str, shopping_list_id: int, item: dict) -> dict:
    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/items/{item['id']}",
        json={"version": item["version"], "checked": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


async def test_setting_active_branch_persists_and_is_returned(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_branch_with_priced_product(async_client)
    shopping_list_id = await create_list(async_client, token)

    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["active_store_branch_id"] == branch_id


async def test_changing_active_branch_does_not_retroactively_modify_already_checked_items(
    async_client: AsyncClient,
) -> None:
    token = await get_access_token(async_client)
    product_id, first_branch_id = await seed_branch_with_priced_product(async_client, price="2.50")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="El Rey", country="PA")
        session.add(store)
        await session.flush()
        second_branch = StoreBranch(store_id=store.id, name="El Rey - Vía España", city="Panamá")
        session.add(second_branch)
        await session.flush()
        session.add(StoreProduct(store_branch_id=second_branch.id, product_id=product_id, current_price=Decimal("3.10")))
        await session.commit()
        second_branch_id = second_branch.id

    shopping_list_id = await create_list(async_client, token)
    await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": first_branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    item = await add_item(async_client, token, shopping_list_id, product_id)
    checked_item = await check_item(async_client, token, shopping_list_id, item)
    assert checked_item["store_branch_id"] == first_branch_id
    assert checked_item["price_at_check"] == "2.50"

    # Changing the list's active branch afterwards must not rewrite the already-checked item.
    await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": second_branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    items_response = await async_client.get(
        f"/shopping-lists/{shopping_list_id}/items", headers={"Authorization": f"Bearer {token}"}
    )
    assert items_response.status_code == 200
    [refetched_item] = items_response.json()
    assert refetched_item["store_branch_id"] == first_branch_id
    assert refetched_item["price_at_check"] == "2.50"


async def test_set_active_branch_rejects_unknown_branch(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    shopping_list_id = await create_list(async_client, token)

    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": 999999},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


async def test_set_active_branch_requires_list_membership(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    _, branch_id = await seed_branch_with_priced_product(async_client)
    shopping_list_id = await create_list(async_client, token)

    outsider_token = await get_access_token(async_client, OUTSIDER_CREDENTIALS)
    response = await async_client.patch(
        f"/shopping-lists/{shopping_list_id}/active-branch",
        json={"store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert response.status_code == 403
