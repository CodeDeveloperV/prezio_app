from sqlalchemy import select

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
