from httpx import AsyncClient

from app.features.stores.models import Store, StoreBranch


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


async def test_get_store_branch_includes_store_name(async_client: AsyncClient) -> None:
    branch_id = await seed_branch(
        async_client, store_name="Super 99", city="Panama City", branch_name="San Francisco"
    )

    response = await async_client.get(f"/stores/branches/{branch_id}")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "id": branch_id,
        "store_id": body["store_id"],
        "name": "San Francisco",
        "city": "Panama City",
        "store_name": "Super 99",
    }


async def test_get_store_branch_404_when_missing(async_client: AsyncClient) -> None:
    response = await async_client.get("/stores/branches/999999")

    assert response.status_code == 404
