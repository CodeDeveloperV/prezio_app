from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.features.stores.models import Store, StoreBranch
from app.shared.base_repository import BaseRepository


class StoreRepository(BaseRepository[Store]):
    model = Store


class StoreBranchRepository(BaseRepository[StoreBranch]):
    model = StoreBranch

    async def list_by_store(self, store_id: int) -> list[StoreBranch]:
        result = await self.session.execute(
            select(StoreBranch).where(StoreBranch.store_id == store_id)
        )
        return list(result.scalars().all())

    async def list_by_ids(self, branch_ids: list[int]) -> list[StoreBranch]:
        """Eager-loads `.store` -- callers (e.g. the comparator) need the chain name without
        an extra round trip, and lazy-loading a relationship after the fact isn't safe here
        since this repository's session is async."""
        if not branch_ids:
            return []
        result = await self.session.execute(
            select(StoreBranch).where(StoreBranch.id.in_(branch_ids)).options(selectinload(StoreBranch.store))
        )
        return list(result.scalars().all())

    async def list_by_city(self, city: str) -> list[StoreBranch]:
        result = await self.session.execute(
            select(StoreBranch).where(StoreBranch.city == city).options(selectinload(StoreBranch.store))
        )
        return list(result.scalars().all())
