from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Product, ProductBarcode
from app.features.stores.models import Store, StoreBranch

SCANNER_CREDENTIALS = {"email": "resolver@example.com", "password": "s3cret123"}


async def get_access_token(async_client: AsyncClient) -> str:
    await async_client.post("/auth/register", json=SCANNER_CREDENTIALS)
    login = await async_client.post("/auth/login", json=SCANNER_CREDENTIALS)
    return login.json()["access_token"]


async def seed_branch(async_client: AsyncClient, *, store_name: str = "Super 99") -> tuple[int, int]:
    """Returns (store_id, store_branch_id)."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name=store_name, country="PA")
        session.add(store)
        await session.flush()

        branch = StoreBranch(store_id=store.id, name=f"{store_name} - Test Branch", city="Ciudad de Panamá")
        session.add(branch)
        await session.flush()
        await session.commit()
        return store.id, branch.id


async def seed_product(async_client: AsyncClient, *, canonical_name: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name=canonical_name)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def seed_barcode(async_client: AsyncClient, *, product_id: int, barcode: str, store_id: int | None = None) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(ProductBarcode(product_id=product_id, barcode=barcode, store_id=store_id))
        await session.commit()


async def test_store_specific_barcode_resolves_correct_product_over_global(async_client: AsyncClient) -> None:
    """A store-scoped ProductBarcode must win over a store-agnostic one for the same barcode."""
    store_id, branch_id = await seed_branch(async_client)
    global_product_id = await seed_product(async_client, canonical_name="Leche Genérica 1L")
    store_product_id = await seed_product(async_client, canonical_name="Leche Estrella Azul 1L")
    await seed_barcode(async_client, product_id=global_product_id, barcode="123456")
    await seed_barcode(async_client, product_id=store_product_id, barcode="123456", store_id=store_id)

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "123456", "store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "found"
    assert body["product"]["id"] == store_product_id


async def test_multiple_barcodes_on_one_product_all_resolve_to_it(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    product_id = await seed_product(async_client, canonical_name="Leche Estrella Azul 1L")
    await seed_barcode(async_client, product_id=product_id, barcode="111111")
    await seed_barcode(async_client, product_id=product_id, barcode="222222")
    await seed_barcode(async_client, product_id=product_id, barcode="333333")

    token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    for barcode in ("111111", "222222", "333333"):
        response = await async_client.post(
            "/catalog/scan",
            json={"barcode": barcode, "store_branch_id": branch_id},
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "found"
        assert body["product"]["id"] == product_id


async def test_ambiguous_global_barcode_returns_conflict(async_client: AsyncClient) -> None:
    """Two store-agnostic ProductBarcode rows sharing a barcode but pointing at different
    Products must never be silently resolved -- the engine must surface CONFLICT instead."""
    _, branch_id = await seed_branch(async_client)
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    await seed_barcode(async_client, product_id=product_a, barcode="999999")
    await seed_barcode(async_client, product_id=product_b, barcode="999999")

    token = await get_access_token(async_client)
    response = await async_client.post(
        "/catalog/scan",
        json={"barcode": "999999", "store_branch_id": branch_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "conflict"
    resolved_ids = {c["id"] for c in body["candidates"]}
    assert resolved_ids == {product_a, product_b}
    assert body["warnings"]


async def test_reattaching_same_barcode_to_same_product_is_idempotent(async_client: AsyncClient) -> None:
    _, branch_id = await seed_branch(async_client)
    product_id = await seed_product(async_client, canonical_name="Leche Entera Estrella 1L")

    token = await get_access_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"barcode": "1112223334445"}

    first = await async_client.post(
        f"/catalog/products/{product_id}/barcodes", json=payload, headers=headers
    )
    assert first.status_code == 201
    first_barcode_id = first.json()["id"]

    second = await async_client.post(
        f"/catalog/products/{product_id}/barcodes", json=payload, headers=headers
    )
    assert second.status_code == 201
    assert second.json()["id"] == first_barcode_id

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(
            select(ProductBarcode).where(ProductBarcode.barcode == "1112223334445")
        )
        rows = result.scalars().all()
    assert len(rows) == 1
