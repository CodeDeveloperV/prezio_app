from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.catalog.models import Category, Product
from app.features.moderation.models import ProductMerge
from app.features.pricing.models import StoreProduct
from app.features.reputation.enums import ReputationAction, ReputationLevel
from app.features.reputation.models import ReputationEvent
from app.features.reputation.service import level_for_points, points_to_next_level
from app.features.stores.models import Store, StoreBranch
from app.features.users.models import User
from app.shared.enums import ModerationStatus

MODERATOR_CREDENTIALS = {"email": "moderator@example.com", "password": "s3cret123"}
USER_CREDENTIALS = {"email": "collaborator@example.com", "password": "s3cret123"}


async def register_and_login(async_client: AsyncClient, credentials: dict) -> tuple[str, int]:
    await async_client.post("/auth/register", json=credentials)
    login = await async_client.post("/auth/login", json=credentials)
    token = login.json()["access_token"]
    me = await async_client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


async def promote_to_moderator(async_client: AsyncClient, email: str) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.is_moderator = True
        await session.commit()


async def get_moderator(async_client: AsyncClient) -> tuple[str, int]:
    token, user_id = await register_and_login(async_client, MODERATOR_CREDENTIALS)
    await promote_to_moderator(async_client, MODERATOR_CREDENTIALS["email"])
    return token, user_id


async def seed_branch(async_client: AsyncClient) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name="Super 99", country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name="Branch", city="Ciudad de Panamá")
        session.add(branch)
        await session.commit()
        await session.refresh(branch)
        return branch.id


async def seed_pending_product(async_client: AsyncClient, *, created_by: int) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name="Leche", status=ModerationStatus.PENDING, created_by=created_by)
        session.add(product)
        await session.commit()
        await session.refresh(product)
        return product.id


async def seed_store_product(async_client: AsyncClient, *, branch_id: int, price: str = "2.50") -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        product = Product(canonical_name="Leche", status=ModerationStatus.APPROVED)
        session.add(product)
        await session.flush()
        sp = StoreProduct(store_branch_id=branch_id, product_id=product.id, current_price=Decimal(price), version=1)
        session.add(sp)
        await session.commit()
        await session.refresh(sp)
        return sp.id


async def seed_category(async_client: AsyncClient) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        category = Category(name="Lácteos")
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category.id


async def give_points(async_client: AsyncClient, *, user_id: int, points: int) -> None:
    """Directly seeds a single ReputationEvent worth `points` -- the total is summed on read, so
    one big event is equivalent to many small ones for testing threshold behavior."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        session.add(
            ReputationEvent(
                user_id=user_id,
                action=ReputationAction.CREATE_PRODUCT_APPROVED,
                points=points,
                reference_type="product",
                reference_id=1,
            )
        )
        await session.commit()


# --- pure level/threshold logic -------------------------------------------------------


def test_level_for_points_thresholds() -> None:
    assert level_for_points(0) == ReputationLevel.NIVEL_1
    assert level_for_points(49) == ReputationLevel.NIVEL_1
    assert level_for_points(50) == ReputationLevel.NIVEL_2
    assert level_for_points(149) == ReputationLevel.NIVEL_2
    assert level_for_points(150) == ReputationLevel.EXPERTO
    assert level_for_points(399) == ReputationLevel.EXPERTO
    assert level_for_points(400) == ReputationLevel.MODERADOR
    assert level_for_points(10_000) == ReputationLevel.MODERADOR


def test_points_to_next_level() -> None:
    assert points_to_next_level(0) == 50
    assert points_to_next_level(45) == 5
    assert points_to_next_level(400) is None  # top level reached


# --- earning points through the collaborative flows -----------------------------------


async def test_confirming_a_price_awards_points(async_client: AsyncClient) -> None:
    branch_id = await seed_branch(async_client)
    store_product_id = await seed_store_product(async_client, branch_id=branch_id)
    token, user_id = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.post(
        f"/pricing/store-products/{store_product_id}/confirm", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200

    reputation = await async_client.get(
        f"/reputation/users/{user_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert reputation.json()["total_points"] == 2

    events = await async_client.get(
        f"/reputation/users/{user_id}/events", headers={"Authorization": f"Bearer {token}"}
    )
    [event] = events.json()
    assert event["action"] == "confirm_price"
    assert event["points"] == 2


async def test_updating_a_price_awards_points(async_client: AsyncClient) -> None:
    branch_id = await seed_branch(async_client)
    store_product_id = await seed_store_product(async_client, branch_id=branch_id)
    token, user_id = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.post(
        f"/pricing/store-products/{store_product_id}/price",
        json={"price": "3.00", "version": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    reputation = await async_client.get(
        f"/reputation/users/{user_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert reputation.json()["total_points"] == 3


async def test_approving_a_product_awards_points_to_its_creator(async_client: AsyncClient) -> None:
    creator_token, creator_id = await register_and_login(async_client, USER_CREDENTIALS)
    product_id = await seed_pending_product(async_client, created_by=creator_id)
    moderator_token, _ = await get_moderator(async_client)

    response = await async_client.post(
        f"/moderation/products/{product_id}/approve", headers={"Authorization": f"Bearer {moderator_token}"}
    )
    assert response.status_code == 200

    reputation = await async_client.get(
        f"/reputation/users/{creator_id}", headers={"Authorization": f"Bearer {creator_token}"}
    )
    assert reputation.json()["total_points"] == 10


async def test_approving_a_merge_awards_points_to_the_proposer(async_client: AsyncClient) -> None:
    proposer_token, proposer_id = await register_and_login(async_client, USER_CREDENTIALS)
    product_a = await seed_pending_product(async_client, created_by=proposer_id)
    product_b = await seed_pending_product(async_client, created_by=proposer_id)
    moderator_token, _ = await get_moderator(async_client)

    propose_response = await async_client.post(
        "/moderation/merges",
        json={"source_product_id": product_a, "target_product_id": product_b},
        headers={"Authorization": f"Bearer {proposer_token}"},
    )
    merge_id = propose_response.json()["id"]

    approve_response = await async_client.post(
        f"/moderation/merges/{merge_id}/approve", headers={"Authorization": f"Bearer {moderator_token}"}
    )
    assert approve_response.status_code == 200

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        merge = await session.get(ProductMerge, merge_id)
        assert merge.proposed_by == proposer_id

    reputation = await async_client.get(
        f"/reputation/users/{proposer_id}", headers={"Authorization": f"Bearer {proposer_token}"}
    )
    assert reputation.json()["total_points"] == 8


# --- auto-approval for high-reputation collaborators -----------------------------------


async def test_low_reputation_user_new_product_stays_pending(async_client: AsyncClient) -> None:
    category_id = await seed_category(async_client)
    token, _ = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.post(
        "/catalog/products",
        json={
            "image_url": "https://example.com/leche.jpg",
            "canonical_name": "Leche Deslactosada 1L",
            "category_id": category_id,
            "barcode": "9998887776665",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "pending"


async def test_high_reputation_user_new_product_is_auto_approved(async_client: AsyncClient) -> None:
    category_id = await seed_category(async_client)
    token, user_id = await register_and_login(async_client, USER_CREDENTIALS)
    await give_points(async_client, user_id=user_id, points=400)

    response = await async_client.post(
        "/catalog/products",
        json={
            "image_url": "https://example.com/leche.jpg",
            "canonical_name": "Leche Deslactosada 1L",
            "category_id": category_id,
            "barcode": "9998887776665",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "approved"
    assert body["reviewed_by"] is None  # auto-approved, not by a moderator

    # The auto-approval itself earned points too, on top of the 400 seeded.
    reputation = await async_client.get(
        f"/reputation/users/{user_id}", headers={"Authorization": f"Bearer {token}"}
    )
    reputation_body = reputation.json()
    assert reputation_body["total_points"] == 410
    assert reputation_body["level"] == ReputationLevel.MODERADOR.value
    assert reputation_body["auto_approval_enabled"] is True


async def test_get_user_reputation_endpoint_shape_for_new_user(async_client: AsyncClient) -> None:
    token, user_id = await register_and_login(async_client, USER_CREDENTIALS)

    response = await async_client.get(
        f"/reputation/users/{user_id}", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "user_id": user_id,
        "total_points": 0,
        "level": ReputationLevel.NIVEL_1.value,
        "points_to_next_level": 50,
        "auto_approval_enabled": False,
    }
