from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient

from app.features.catalog.models import Product
from app.features.catalog.enums import BarcodeType
from app.features.catalog.models import ProductBarcode
from app.features.pricing.enums import Availability
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch

CREDENTIALS = {"email": "shopper@example.com", "password": "s3cret123"}
OTHER_CREDENTIALS = {"email": "someone-else@example.com", "password": "s3cret123"}

FRESH = datetime.now(timezone.utc)
STALE = datetime.now(timezone.utc) - timedelta(days=30)


async def get_access_token(async_client: AsyncClient, credentials: dict = CREDENTIALS) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def seed_branch(async_client: AsyncClient, *, store_name: str, city: str, branch_name: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name=store_name, country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name=branch_name, city=city)
        session.add(branch)
        await session.commit()
        await session.refresh(branch)
        return branch.id


async def seed_product(async_client: AsyncClient, name: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name=name)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def seed_store_product(
    async_client: AsyncClient,
    *,
    branch_id: int,
    product_id: int,
    price: str,
    availability: Availability = Availability.IN_STOCK,
    last_verified_at: datetime | None = FRESH,
) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            StoreProduct(
                store_branch_id=branch_id,
                product_id=product_id,
                current_price=price,
                availability=availability,
                last_verified_at=last_verified_at,
            )
        )
        await session.commit()


async def create_shopping_list_with_items(
    async_client: AsyncClient, access_token: str, product_ids: list[int]
) -> int:
    headers = {"Authorization": f"Bearer {access_token}"}
    created = await async_client.post("/shopping-lists", json={"name": "Mi lista"}, headers=headers)
    shopping_list_id = created.json()["id"]
    for product_id in product_ids:
        await async_client.post(
            f"/shopping-lists/{shopping_list_id}/items",
            json={"product_id": product_id, "quantity": 1},
            headers=headers,
        )
    return shopping_list_id


async def test_compare_returns_total_and_comparable_for_fully_priced_branch(async_client: AsyncClient) -> None:
    branch_id = await seed_branch(async_client, store_name="Super 99", city="Ciudad de Panamá", branch_name="Super 99 - Balboa")
    product_id = await seed_product(async_client, "Leche entera 1L")
    await seed_store_product(async_client, branch_id=branch_id, product_id=product_id, price="2.50")

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, [product_id])

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    result = body["results"][0]
    assert result["store_branch_id"] == branch_id
    assert result["store_name"] == "Super 99"
    assert result["total"] == "2.50"
    assert result["found_products_count"] == 1
    assert result["total_known"] == 1
    assert result["coverage_percentage"] == 1.0
    assert result["comparable"] is True
    assert body["cheapest_comparable_branch_id"] == branch_id
    # Only one comparable branch -- nothing to save against.
    assert body["estimated_savings"] is None
    assert result["savings_vs_most_expensive"] is None


async def test_compare_marks_branch_not_comparable_when_coverage_below_threshold(async_client: AsyncClient) -> None:
    branch_id = await seed_branch(async_client, store_name="Rey", city="Ciudad de Panamá", branch_name="Rey - Vía España")
    priced_product_id = await seed_product(async_client, "Arroz 1lb")
    missing_product_id = await seed_product(async_client, "Café molido")
    await seed_store_product(async_client, branch_id=branch_id, product_id=priced_product_id, price="1.00")
    # missing_product_id has no StoreProduct at this branch at all -- coverage is 1/2 = 0.5,
    # below the default MIN_COMPARISON_COVERAGE of 0.80.

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(
        async_client, access_token, [priced_product_id, missing_product_id]
    )

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["coverage_percentage"] == 0.5
    assert result["comparable"] is False
    assert result["missing_products_count"] == 1
    assert response.json()["cheapest_comparable_branch_id"] is None


async def test_compare_separates_missing_price_unavailable_stale_and_unavailable_statuses(
    async_client: AsyncClient,
) -> None:
    branch_id = await seed_branch(async_client, store_name="Xtra", city="David", branch_name="Xtra - David")
    missing_id = await seed_product(async_client, "Producto sin listar")
    price_unavailable_id = await seed_product(async_client, "Producto con precio inválido")
    stale_id = await seed_product(async_client, "Producto con precio viejo")
    unavailable_id = await seed_product(async_client, "Producto agotado")
    available_id = await seed_product(async_client, "Producto disponible")

    await seed_store_product(async_client, branch_id=branch_id, product_id=price_unavailable_id, price="0.00")
    await seed_store_product(
        async_client, branch_id=branch_id, product_id=stale_id, price="3.00", last_verified_at=STALE
    )
    await seed_store_product(
        async_client,
        branch_id=branch_id,
        product_id=unavailable_id,
        price="4.00",
        availability=Availability.OUT_OF_STOCK,
    )
    await seed_store_product(async_client, branch_id=branch_id, product_id=available_id, price="5.00")

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(
        async_client,
        access_token,
        [missing_id, price_unavailable_id, stale_id, unavailable_id, available_id],
    )

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "David"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    result = response.json()["results"][0]
    assert result["missing_products_count"] == 1
    assert result["price_unavailable_count"] == 1
    assert result["stale_prices_count"] == 1
    assert result["unavailable_products_count"] == 1
    assert result["found_products_count"] == 1
    # Stale price is excluded from `found_products_count` but still contributes to `total`
    # (best known price beats no price at all): 3.00 (stale) + 5.00 (available) = 8.00.
    assert result["total"] == "8.00"
    # coverage_percentage counts AVAILABLE + STALE_PRICE (usable prices): 2/5 = 0.4.
    assert result["coverage_percentage"] == 0.4
    # fresh_coverage_percentage counts AVAILABLE only, STALE_PRICE does not count: 1/5 = 0.2.
    assert result["fresh_coverage_percentage"] == 0.2
    assert result["has_stale_prices"] is True

    lines_by_status = {line["status"]: line for line in result["lines"]}
    assert lines_by_status["missing_product"]["unit_price"] is None
    assert lines_by_status["price_unavailable"]["unit_price"] is None
    assert lines_by_status["unavailable"]["unit_price"] is None
    assert lines_by_status["stale_price"]["unit_price"] == "3.00"
    assert lines_by_status["available"]["unit_price"] == "5.00"


async def test_compare_computes_estimated_savings_between_cheapest_and_most_expensive_comparable(
    async_client: AsyncClient,
) -> None:
    cheap_branch_id = await seed_branch(async_client, store_name="Super 99", city="Ciudad de Panamá", branch_name="Super 99 - Balboa")
    pricey_branch_id = await seed_branch(async_client, store_name="Rey", city="Ciudad de Panamá", branch_name="Rey - Vía España")
    product_id = await seed_product(async_client, "Leche entera 1L")
    await seed_store_product(async_client, branch_id=cheap_branch_id, product_id=product_id, price="2.50")
    await seed_store_product(async_client, branch_id=pricey_branch_id, product_id=product_id, price="3.75")

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, [product_id])

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    body = response.json()
    assert body["cheapest_comparable_branch_id"] == cheap_branch_id
    assert body["most_expensive_comparable_branch_id"] == pricey_branch_id
    assert body["estimated_savings"] == "1.25"

    results_by_branch = {result["store_branch_id"]: result for result in body["results"]}
    assert results_by_branch[cheap_branch_id]["savings_vs_most_expensive"] == "1.25"
    assert results_by_branch[pricey_branch_id]["savings_vs_most_expensive"] == "0.00"
    # Cheapest comparable result sorts first.
    assert body["results"][0]["store_branch_id"] == cheap_branch_id


async def test_compare_by_explicit_store_branch_ids_ignores_other_branches_in_same_city(
    async_client: AsyncClient,
) -> None:
    branch_a = await seed_branch(async_client, store_name="Super 99", city="Ciudad de Panamá", branch_name="Super 99 - Balboa")
    branch_b = await seed_branch(async_client, store_name="Rey", city="Ciudad de Panamá", branch_name="Rey - Vía España")
    product_id = await seed_product(async_client, "Leche entera 1L")
    await seed_store_product(async_client, branch_id=branch_a, product_id=product_id, price="2.50")
    await seed_store_product(async_client, branch_id=branch_b, product_id=product_id, price="3.75")

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, [product_id])

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"store_branch_ids": [branch_a]},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    body = response.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["store_branch_id"] == branch_a


async def test_compare_requires_city_or_store_branch_ids(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, "Leche entera 1L")
    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, [product_id])

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 400


async def test_compare_unknown_shopping_list_returns_404(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)

    response = await async_client.post(
        "/comparison/shopping-lists/999/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


async def test_compare_shopping_list_owned_by_another_user_returns_403(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, "Leche entera 1L")
    owner_token = await get_access_token(async_client, CREDENTIALS)
    shopping_list_id = await create_shopping_list_with_items(async_client, owner_token, [product_id])

    other_token = await get_access_token(async_client, OTHER_CREDENTIALS)

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 403


async def test_compare_empty_shopping_list_returns_400(async_client: AsyncClient) -> None:
    access_token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {access_token}"}
    created = await async_client.post("/shopping-lists", json={"name": "Lista vacía"}, headers=headers)
    shopping_list_id = created.json()["id"]

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers=headers,
    )

    assert response.status_code == 400


async def test_compare_ignores_product_barcodes_and_uses_product_identity_only(async_client: AsyncClient) -> None:
    """Two different barcodes resolving to the same Product must not duplicate its line or
    inflate the total -- the comparator keys everything off `product_id`, never `barcode`."""
    branch_id = await seed_branch(async_client, store_name="Super 99", city="Ciudad de Panamá", branch_name="Super 99 - Balboa")
    product_id = await seed_product(async_client, "Leche entera 1L")
    await seed_store_product(async_client, branch_id=branch_id, product_id=product_id, price="2.50")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add_all(
            [
                ProductBarcode(product_id=product_id, barcode="7501234567890", barcode_type=BarcodeType.EAN13),
                ProductBarcode(product_id=product_id, barcode="INTERNAL-001", barcode_type=BarcodeType.STORE_SKU),
            ]
        )
        await session.commit()

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, [product_id])

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    result = response.json()["results"][0]
    assert len(result["lines"]) == 1
    assert result["total"] == "2.50"


async def test_compare_incomplete_cheap_branch_never_wins_over_comparable_branches(
    async_client: AsyncClient,
) -> None:
    """A branch missing most of the list can have an artificially tiny total (it only priced
    one cheap item) -- it must never be picked as cheapest/most-expensive/savings-baseline,
    and it must sort after every comparable branch regardless of its total."""
    incomplete_branch_id = await seed_branch(
        async_client, store_name="Xtra", city="Ciudad de Panamá", branch_name="Xtra - Incompleta"
    )
    cheap_branch_id = await seed_branch(
        async_client, store_name="Super 99", city="Ciudad de Panamá", branch_name="Super 99 - Balboa"
    )
    pricey_branch_id = await seed_branch(
        async_client, store_name="Riba Smith", city="Ciudad de Panamá", branch_name="Riba Smith - Costa del Este"
    )
    product_ids = [await seed_product(async_client, f"Producto {i}") for i in range(5)]

    # Only prices the first (cheapest) product -- coverage 1/5 = 0.2, well below the threshold.
    await seed_store_product(async_client, branch_id=incomplete_branch_id, product_id=product_ids[0], price="0.50")

    for product_id in product_ids:
        await seed_store_product(async_client, branch_id=cheap_branch_id, product_id=product_id, price="8.00")
        await seed_store_product(async_client, branch_id=pricey_branch_id, product_id=product_id, price="12.00")

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, product_ids)

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    body = response.json()
    results_by_branch = {result["store_branch_id"]: result for result in body["results"]}

    assert results_by_branch[incomplete_branch_id]["comparable"] is False
    assert results_by_branch[incomplete_branch_id]["total"] == "0.50"

    # The incomplete branch's total ($0.50) is far below both comparable branches' totals, yet
    # it must never be declared cheapest, most expensive, or used as the savings baseline.
    assert body["cheapest_comparable_branch_id"] == cheap_branch_id
    assert body["most_expensive_comparable_branch_id"] == pricey_branch_id
    assert body["estimated_savings"] == "20.00"
    assert results_by_branch[cheap_branch_id]["savings_vs_most_expensive"] == "20.00"
    assert results_by_branch[incomplete_branch_id]["savings_vs_most_expensive"] is None

    # Comparable branches sort first (cheapest first) regardless of the incomplete branch's total.
    ordered_branch_ids = [result["store_branch_id"] for result in body["results"]]
    assert ordered_branch_ids == [cheap_branch_id, pricey_branch_id, incomplete_branch_id]


async def test_compare_marks_branch_not_comparable_when_fresh_coverage_below_threshold(
    async_client: AsyncClient,
) -> None:
    """A branch can clear min_comparison_coverage (0.80) on stale prices alone and still be
    correctly rejected by the stricter min_fresh_comparison_coverage (0.60)."""
    branch_id = await seed_branch(async_client, store_name="PriceSmart", city="Ciudad de Panamá", branch_name="PriceSmart - Brisas")
    product_ids = [await seed_product(async_client, f"Producto {i}") for i in range(5)]

    # 4 stale prices + 1 missing product: coverage = 4/5 = 0.8 (meets min_comparison_coverage),
    # but fresh_coverage = 0/5 = 0.0 (fails min_fresh_comparison_coverage of 0.60).
    for product_id in product_ids[:4]:
        await seed_store_product(
            async_client, branch_id=branch_id, product_id=product_id, price="3.00", last_verified_at=STALE
        )

    access_token = await get_access_token(async_client)
    shopping_list_id = await create_shopping_list_with_items(async_client, access_token, product_ids)

    response = await async_client.post(
        f"/comparison/shopping-lists/{shopping_list_id}/compare",
        json={"city": "Ciudad de Panamá"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    result = response.json()["results"][0]
    assert result["coverage_percentage"] == 0.8
    assert result["fresh_coverage_percentage"] == 0.0
    assert result["has_stale_prices"] is True
    assert result["comparable"] is False
