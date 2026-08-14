from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Brand, Category, Product, ProductBarcode
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch

SCANNER_CREDENTIALS = {"email": "scanner@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient) -> str:
    await async_client.post("/auth/register", json=SCANNER_CREDENTIALS)
    login = await async_client.post("/auth/login", json=SCANNER_CREDENTIALS)
    return login.json()["access_token"]


async def seed_branch(async_client: AsyncClient) -> tuple[int, int]:
    """Returns (store_id, store_branch_id)."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()

        branch = StoreBranch(store_id=store.id, name="Super 99 - Test Branch", city="Ciudad de Panamá")
        session.add(branch)
        await session.flush()
        await session.commit()
        return store.id, branch.id


async def seed_product(
    async_client: AsyncClient, *, canonical_name: str, brand_id: int | None = None, category_id: int | None = None
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name=canonical_name, brand_id=brand_id, category_id=category_id)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def seed_category(async_client: AsyncClient, name: str = "Lácteos") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        category = Category(name=name)
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category.id


async def seed_brand(async_client: AsyncClient, name: str = "Estrella") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        brand = Brand(name=name)
        session.add(brand)
        await session.commit()
        await session.refresh(brand)
        return brand.id


async def seed_barcode(async_client: AsyncClient, *, product_id: int, barcode: str, store_id: int | None = None) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(ProductBarcode(product_id=product_id, barcode=barcode, store_id=store_id))
        await session.commit()


async def test_scan_known_barcode_returns_product_and_store_product(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_branch(async_client)
    category_id = await seed_category(async_client)
    product_id = await seed_product(async_client, canonical_name="Leche entera 1L", category_id=category_id)
    await seed_barcode(async_client, product_id=product_id, barcode="7501234567890")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            StoreProduct(store_branch_id=branch_id, product_id=product_id, current_price="2.50", version=1)
        )
        await session.commit()

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "7501234567890", "store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "found"
    assert body["product"]["canonical_name"] == "Leche entera 1L"
    assert body["store_product"]["current_price"] == "2.50"


async def test_scan_known_barcode_without_store_product_still_returns_product(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    product_id = await seed_product(async_client, canonical_name="Leche entera 1L")
    await seed_barcode(async_client, product_id=product_id, barcode="7501234567890")

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "7501234567890", "store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "found"
    assert body["store_product"] is None


async def test_scan_unknown_barcode_with_similar_product_returns_disambiguation(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    category_id = await seed_category(async_client)
    brand_id = await seed_brand(async_client)
    await seed_product(async_client, canonical_name="Leche Entera Estrella 1L", brand_id=brand_id, category_id=category_id)

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={
            "barcode": "0000000000000",
            "store_branch_id": branch_id,
            "name_hint": "Leche Entera Estrella 1 Litro",
            "brand_id": brand_id,
            "category_id": category_id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "needs_disambiguation"
    assert len(body["candidates"]) == 1
    assert body["candidates"][0]["product"]["canonical_name"] == "Leche Entera Estrella 1L"
    assert "brand" in body["candidates"][0]["matched_on"]


async def test_scan_unknown_barcode_with_no_candidates_returns_not_found(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "0000000000000", "store_branch_id": branch_id, "name_hint": "Producto totalmente distinto"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "not_found"


async def test_catalog_search_returns_matching_product_and_branch_price(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    category_id = await seed_category(async_client)
    brand_id = await seed_brand(async_client, name="Estrella")
    product_id = await seed_product(
        async_client,
        canonical_name="Leche Entera 1L",
        brand_id=brand_id,
        category_id=category_id,
    )

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(StoreProduct(store_branch_id=branch_id, product_id=product_id, current_price="2.50", version=1))
        await session.commit()

    token = await get_access_token(async_client)
    response = await async_client.get(
        "/catalog/products/search",
        params={"q": "Estrella", "store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["product"]["canonical_name"] == "Leche Entera 1L"
    assert body[0]["product"]["brand_name"] == "Estrella"
    assert body[0]["store_product"]["current_price"] == "2.50"


async def test_attach_barcode_to_existing_product_creates_only_barcode(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    product_id = await seed_product(async_client, canonical_name="Leche Entera Estrella 1L")

    token = await get_access_token(async_client)
    response = await async_client.post(
        f"/catalog/products/{product_id}/barcodes",
        json={"barcode": "1112223334445"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["product_id"] == product_id
    assert body["barcode"] == "1112223334445"
    assert body["status"] == "pending"

    products_response = await async_client.get("/catalog/products")
    assert len(products_response.json()) == 1  # no new Product was created


async def test_create_product_from_scan_creates_pending_product_with_barcode(async_client: AsyncClient) -> None:
    category_id = await seed_category(async_client)
    token = await get_access_token(async_client)

    response = await async_client.post(
        "/catalog/products",
        json={
            "image_url": "https://example.com/leche.jpg",
            "canonical_name": "Leche Deslactosada 1L",
            "brand_name": "Nueva Marca",
            "presentation": "1L",
            "category_id": category_id,
            "barcode": "9998887776665",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["canonical_name"] == "Leche Deslactosada 1L"
    assert body["brand_id"] is not None

    scan_response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "9998887776665", "store_branch_id": (await seed_branch(async_client))[1]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert scan_response.json()["status"] == "found"
    assert scan_response.json()["product"]["id"] == body["id"]


async def test_report_incorrect_barcode_marks_it_rejected(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Producto Equivocado")
    await seed_barcode(async_client, product_id=product_id, barcode="5556667778889")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(
            select(ProductBarcode).where(ProductBarcode.barcode == "5556667778889")
        )
        barcode_id = result.scalar_one().id

    token = await get_access_token(async_client)
    response = await async_client.post(
        f"/catalog/barcodes/{barcode_id}/report",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "rejected"
    assert body["reviewed_by"] is not None


async def test_report_unknown_barcode_returns_404(async_client: AsyncClient) -> None:
    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/barcodes/999/report",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


async def test_rescanning_a_reported_barcode_falls_through_to_disambiguation(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    category_id = await seed_category(async_client)
    brand_id = await seed_brand(async_client)
    await seed_product(async_client, canonical_name="Producto Correcto", brand_id=brand_id, category_id=category_id)
    wrong_product_id = await seed_product(async_client, canonical_name="Producto Equivocado")
    await seed_barcode(async_client, product_id=wrong_product_id, barcode="4445556667778")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(
            select(ProductBarcode).where(ProductBarcode.barcode == "4445556667778")
        )
        barcode_id = result.scalar_one().id

    token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    report_response = await async_client.post(f"/catalog/barcodes/{barcode_id}/report", headers=headers)
    assert report_response.status_code == 200

    scan_response = await async_client.post(
        "/catalog/scan",
        json={
            "barcode": "4445556667778",
            "store_branch_id": branch_id,
            "name_hint": "Producto Correcto",
            "brand_id": brand_id,
            "category_id": category_id,
        },
        headers=headers,
    )

    assert scan_response.status_code == 200
    assert scan_response.json()["status"] == "needs_disambiguation"


async def test_attach_duplicate_barcode_at_same_store_returns_409(async_client: AsyncClient) -> None:
    store_id, _ = await seed_branch(async_client)
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    await seed_barcode(async_client, product_id=product_a, barcode="1231231231230", store_id=store_id)

    token = await get_access_token(async_client)
    response = await async_client.post(
        f"/catalog/products/{product_b}/barcodes",
        json={"barcode": "1231231231230", "store_id": store_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
