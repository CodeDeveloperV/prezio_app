from decimal import Decimal

from httpx import AsyncClient

from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store


async def add_product(async_client: AsyncClient, name: str = "Leche Estrella 1L") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.models import Product

    async with session_factory() as session:
        product = Product(canonical_name=name)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def add_listing(
    async_client: AsyncClient, branch_id: int, product_id: int, price: str = "1.50", status: str = "active"
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = StoreProduct(
            store_branch_id=branch_id, product_id=product_id, current_price=Decimal(price), status=status
        )
        session.add(listing)
        await session.commit()
        await session.refresh(listing)
        return listing.id


async def _admin(async_client: AsyncClient, store_id: int, email: str = "admin@example.com") -> str:
    admin_id, admin_token = await register_and_login(async_client, email)
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    return admin_token


async def test_admin_can_list_and_add_product_to_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches",
        json={"branch_ids": [branch_id], "initial_price": "2.75", "currency": "USD"},
        headers=auth(admin_token),
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body) == 1
    assert body[0]["branch_id"] == branch_id
    assert body[0]["status"] == "active"
    assert body[0]["current_price"] == "2.75"


async def test_product_summary_and_detail_expose_a_representative_barcode(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    product_id = await add_product(async_client)
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.models import ProductBarcode

    async with session_factory() as session:
        session.add(ProductBarcode(product_id=product_id, barcode="7501234567890"))
        await session.commit()

    admin_token = await _admin(async_client, store_id)

    list_response = await async_client.get(
        f"/b2b/organizations/{store_id}/catalog/products", headers=auth(admin_token)
    )
    detail_response = await async_client.get(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}", headers=auth(admin_token)
    )

    assert list_response.status_code == 200
    assert next(p for p in list_response.json() if p["id"] == product_id)["barcode"] == "7501234567890"
    assert detail_response.status_code == 200
    assert detail_response.json()["barcode"] == "7501234567890"


async def test_organization_isolation_on_catalog_products(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Riba Smith")
    product_id = await add_product(async_client)
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")

    response = await async_client.get(
        f"/b2b/organizations/{store_b_id}/catalog/products/{product_id}", headers=auth(admin_a_token)
    )

    assert response.status_code == 404


async def test_employee_with_restricted_branch_scope_only_sees_that_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    await add_listing(async_client, other_branch_id, product_id, status="active")

    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.get(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches", headers=auth(employee_token)
    )

    assert response.status_code == 200
    branch_ids = {b["branch_id"] for b in response.json()}
    assert branch_ids == {branch_id}


async def test_manager_cannot_add_listing_to_branch_outside_their_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches",
        json={"branch_ids": [other_branch_id], "initial_price": "1.00", "currency": "USD"},
        headers=auth(manager_token),
    )

    assert response.status_code == 403


async def test_employee_cannot_create_listing_read_only(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)

    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches",
        json={"branch_ids": [branch_id], "initial_price": "1.00", "currency": "USD"},
        headers=auth(employee_token),
    )

    assert response.status_code == 403


async def test_adding_product_to_already_listed_branch_does_not_duplicate(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches",
        json={"branch_ids": [branch_id], "initial_price": "9.99", "currency": "USD"},
        headers=auth(admin_token),
    )

    assert response.status_code == 201

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import select

    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        result = await session.execute(
            select(StoreProduct).where(
                StoreProduct.store_branch_id == branch_id, StoreProduct.product_id == product_id
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        # Existing listing's price is untouched -- creating never overwrites price.
        assert rows[0].current_price == Decimal("1.50")


async def test_reactivating_inactive_listing_does_not_create_new_row(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, status="inactive")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches",
        json={"branch_ids": [branch_id], "initial_price": "3.00", "currency": "USD"},
        headers=auth(admin_token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body[0]["store_product_id"] == listing_id
    assert body[0]["status"] == "active"


async def test_deactivating_listing_preserves_price_history(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, status="active")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import PriceHistory

    async with session_factory() as session:
        session.add(PriceHistory(store_product_id=listing_id, new_price=Decimal("1.50")))
        await session.commit()

    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}/branches/{branch_id}",
        json={"status": "inactive"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "inactive"

    from sqlalchemy import select

    async with session_factory() as session:
        result = await session.execute(select(PriceHistory).where(PriceHistory.store_product_id == listing_id))
        assert len(result.scalars().all()) == 1


async def test_b2b_catalog_endpoints_cannot_edit_the_global_product(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    product_id = await add_product(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/catalog/products/{product_id}",
        json={"canonical_name": "Hacked name"},
        headers=auth(admin_token),
    )

    assert response.status_code == 405

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.models import Product

    async with session_factory() as session:
        product = await session.get(Product, product_id)
        assert product is not None
        assert product.canonical_name != "Hacked name"
