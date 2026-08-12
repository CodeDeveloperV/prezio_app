from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Product, ProductAlias, ProductBarcode
from app.features.pricing.models import PriceHistory, StoreProduct
from app.features.stores.models import Store, StoreBranch
from app.features.users.models import User
from app.shared.enums import ModerationStatus

MODERATOR_CREDENTIALS = {"email": "moderator@example.com", "password": "s3cret123"}
USER_CREDENTIALS = {"email": "regular@example.com", "password": "s3cret123"}


async def register_and_login(async_client: AsyncClient, credentials: dict) -> str:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    return login.json()["access_token"]


async def promote_to_moderator(async_client: AsyncClient, email: str) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.is_moderator = True
        await session.commit()


async def get_moderator_token(async_client: AsyncClient) -> str:
    token = await register_and_login(async_client, MODERATOR_CREDENTIALS)
    await promote_to_moderator(async_client, MODERATOR_CREDENTIALS["email"])
    return token


async def seed_product(
    async_client: AsyncClient, *, canonical_name: str, status: ModerationStatus = ModerationStatus.PENDING
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name=canonical_name, status=status)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def seed_barcode(
    async_client: AsyncClient,
    *,
    product_id: int,
    barcode: str,
    status: ModerationStatus = ModerationStatus.PENDING,
    store_id: int | None = None,
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        row = ProductBarcode(product_id=product_id, barcode=barcode, store_id=store_id, status=status)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row.id


async def seed_alias(
    async_client: AsyncClient,
    *,
    product_id: int,
    alias: str,
    language: str = "es",
    status: ModerationStatus = ModerationStatus.PENDING,
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        row = ProductAlias(product_id=product_id, alias=alias, language=language, status=status)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row.id


async def seed_branch(async_client: AsyncClient, name: str = "Branch") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name=name, city="Ciudad de Panamá")
        session.add(branch)
        await session.commit()
        await session.refresh(branch)
        return branch.id


async def seed_store_product(
    async_client: AsyncClient, *, branch_id: int, product_id: int, price: str, version: int = 1
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        sp = StoreProduct(
            store_branch_id=branch_id, product_id=product_id, current_price=Decimal(price), version=version
        )
        session.add(sp)
        await session.commit()
        await session.refresh(sp)
        return sp.id


async def seed_price_history(async_client: AsyncClient, *, store_product_id: int, previous_price, new_price) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            PriceHistory(
                store_product_id=store_product_id,
                previous_price=Decimal(previous_price) if previous_price is not None else None,
                new_price=Decimal(new_price),
            )
        )
        await session.commit()


# --- products -----------------------------------------------------------------------


async def test_non_moderator_cannot_approve_product(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    token = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.post(
        f"/moderation/products/{product_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403


async def test_moderator_can_approve_pending_product(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/products/{product_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["reviewed_by"] is not None


async def test_moderator_can_reject_pending_product(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/products/{product_id}/reject", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


async def test_approving_already_reviewed_product_returns_409(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche", status=ModerationStatus.APPROVED)
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/products/{product_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 409


# --- barcodes -----------------------------------------------------------------------


async def test_moderator_can_approve_pending_barcode(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    barcode_id = await seed_barcode(async_client, product_id=product_id, barcode="1112223334445")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/barcodes/{barcode_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"


async def test_moderator_can_move_barcode_to_another_product(async_client: AsyncClient) -> None:
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    barcode_id = await seed_barcode(async_client, product_id=product_a, barcode="9998887776665")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/barcodes/{barcode_id}/move",
        json={"target_product_id": product_b},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["product_id"] == product_b


# --- aliases -----------------------------------------------------------------------


async def test_moderator_can_approve_pending_alias(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    alias_id = await seed_alias(async_client, product_id=product_id, alias="Lechita")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/aliases/{alias_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"


async def test_move_alias_discards_duplicate_already_on_target(async_client: AsyncClient) -> None:
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    await seed_alias(async_client, product_id=product_b, alias="Leche Estrella", status=ModerationStatus.APPROVED)
    alias_id = await seed_alias(async_client, product_id=product_a, alias="Leche Estrella")
    token = await get_moderator_token(async_client)

    response = await async_client.post(
        f"/moderation/aliases/{alias_id}/move",
        json={"target_product_id": product_b},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(ProductAlias).where(ProductAlias.product_id == product_b))
        remaining = result.scalars().all()
        assert len(remaining) == 1  # duplicate discarded, not duplicated


# --- product merges: propose/approve/reject + no-data-loss guarantee ----------------


async def test_propose_merge_rejects_self_merge(async_client: AsyncClient) -> None:
    product_id = await seed_product(async_client, canonical_name="Leche")
    token = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.post(
        "/moderation/merges",
        json={"source_product_id": product_id, "target_product_id": product_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400


async def test_any_authenticated_user_can_propose_merge_but_only_moderator_can_approve(
    async_client: AsyncClient,
) -> None:
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    user_token = await register_and_login(async_client, USER_CREDENTIALS)

    propose_response = await async_client.post(
        "/moderation/merges",
        json={"source_product_id": product_a, "target_product_id": product_b},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert propose_response.status_code == 201
    merge_id = propose_response.json()["id"]

    forbidden_response = await async_client.post(
        f"/moderation/merges/{merge_id}/approve", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert forbidden_response.status_code == 403


async def test_reject_merge_leaves_both_products_untouched(async_client: AsyncClient) -> None:
    product_a = await seed_product(async_client, canonical_name="Producto A")
    product_b = await seed_product(async_client, canonical_name="Producto B")
    token = await get_moderator_token(async_client)

    propose_response = await async_client.post(
        "/moderation/merges",
        json={"source_product_id": product_a, "target_product_id": product_b},
        headers={"Authorization": f"Bearer {token}"},
    )
    merge_id = propose_response.json()["id"]

    response = await async_client.post(
        f"/moderation/merges/{merge_id}/reject", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        source = await session.get(Product, product_a)
        assert source.status == ModerationStatus.PENDING


async def test_approve_merge_migrates_everything_without_losing_data(async_client: AsyncClient) -> None:
    branch1 = await seed_branch(async_client, name="Branch 1")
    branch2 = await seed_branch(async_client, name="Branch 2")
    branch3 = await seed_branch(async_client, name="Branch 3")

    product_a = await seed_product(async_client, canonical_name="Producto A (duplicado)")
    product_b = await seed_product(async_client, canonical_name="Producto B (principal)")

    await seed_barcode(async_client, product_id=product_a, barcode="AAA1112223334")
    await seed_alias(async_client, product_id=product_a, alias="Leche A")

    # branch1: both have a StoreProduct -- target's live price/version must win, but the
    # source's price history must be fully preserved on the target's row.
    sp_a1 = await seed_store_product(async_client, branch_id=branch1, product_id=product_a, price="2.00")
    await seed_price_history(async_client, store_product_id=sp_a1, previous_price=None, new_price="1.50")
    await seed_price_history(async_client, store_product_id=sp_a1, previous_price="1.50", new_price="2.00")
    sp_b1 = await seed_store_product(async_client, branch_id=branch1, product_id=product_b, price="3.00", version=2)

    # branch2: both have a StoreProduct, but the source's row has zero recorded history --
    # merging must synthesize one snapshot row so that last-known price isn't silently lost.
    sp_a2 = await seed_store_product(async_client, branch_id=branch2, product_id=product_a, price="5.00")
    sp_b2 = await seed_store_product(async_client, branch_id=branch2, product_id=product_b, price="6.00")

    # branch3: only the source has a StoreProduct -- it should simply be reparented onto target.
    sp_a3 = await seed_store_product(async_client, branch_id=branch3, product_id=product_a, price="9.00")

    token = await get_moderator_token(async_client)

    propose_response = await async_client.post(
        "/moderation/merges",
        json={"source_product_id": product_a, "target_product_id": product_b, "reason": "duplicate listing"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert propose_response.status_code == 201
    merge_id = propose_response.json()["id"]

    approve_response = await async_client.post(
        f"/moderation/merges/{merge_id}/approve", headers={"Authorization": f"Bearer {token}"}
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        source = await session.get(Product, product_a)
        assert source.status == ModerationStatus.MERGED

        # barcode + alias moved onto the target, none left dangling on the source
        barcode = (
            await session.execute(select(ProductBarcode).where(ProductBarcode.barcode == "AAA1112223334"))
        ).scalar_one()
        assert barcode.product_id == product_b

        alias = (await session.execute(select(ProductAlias).where(ProductAlias.alias == "Leche A"))).scalar_one()
        assert alias.product_id == product_b

        source_barcodes = (
            await session.execute(select(ProductBarcode).where(ProductBarcode.product_id == product_a))
        ).scalars().all()
        assert source_barcodes == []

        source_store_products = (
            await session.execute(select(StoreProduct).where(StoreProduct.product_id == product_a))
        ).scalars().all()
        assert source_store_products == []  # nothing left pointing at the merged-away product

        # branch1: target's own price/version stayed authoritative...
        target_sp1 = await session.get(StoreProduct, sp_b1)
        assert target_sp1.current_price == Decimal("3.00")
        assert target_sp1.version == 2
        # ...but every one of the source's price-history rows was preserved on it
        sp1_history = (
            await session.execute(select(PriceHistory).where(PriceHistory.store_product_id == sp_b1))
        ).scalars().all()
        assert len(sp1_history) == 2
        assert {h.new_price for h in sp1_history} == {Decimal("1.50"), Decimal("2.00")}
        assert await session.get(StoreProduct, sp_a1) is None  # source row deleted, not left dangling

        # branch2: source had no history at all -- one synthetic snapshot preserves its
        # last-known price instead of silently dropping it
        target_sp2 = await session.get(StoreProduct, sp_b2)
        assert target_sp2.current_price == Decimal("6.00")
        sp2_history = (
            await session.execute(select(PriceHistory).where(PriceHistory.store_product_id == sp_b2))
        ).scalars().all()
        assert len(sp2_history) == 1
        assert sp2_history[0].previous_price is None
        assert sp2_history[0].new_price == Decimal("5.00")
        assert await session.get(StoreProduct, sp_a2) is None

        # branch3: no conflict on the target -- the source's StoreProduct is simply reparented
        target_sp3 = await session.get(StoreProduct, sp_a3)
        assert target_sp3.product_id == product_b
        assert target_sp3.current_price == Decimal("9.00")
