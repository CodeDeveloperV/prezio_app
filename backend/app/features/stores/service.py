from app.features.stores.models import Store, StoreBranch
from app.features.stores.repository import StoreBranchRepository, StoreRepository


class StoreService:
    def __init__(self, stores: StoreRepository, branches: StoreBranchRepository) -> None:
        self.stores = stores
        self.branches = branches

    async def list_stores(self) -> list[Store]:
        return await self.stores.list_all()

    async def list_branches(self, store_id: int) -> list[StoreBranch]:
        return await self.branches.list_by_store(store_id)

    async def get_branch(self, branch_id: int) -> StoreBranch | None:
        branches = await self.branches.list_by_ids([branch_id])
        return branches[0] if branches else None
