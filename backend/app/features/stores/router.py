from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.stores.repository import StoreBranchRepository, StoreRepository
from app.features.stores.schemas import StoreBranchRead, StoreBranchWithStoreRead, StoreRead
from app.features.stores.service import StoreService

router = APIRouter(prefix="/stores", tags=["stores"])


def get_store_service(db: AsyncSession = Depends(get_db)) -> StoreService:
    return StoreService(StoreRepository(db), StoreBranchRepository(db))


@router.get("", response_model=list[StoreRead])
async def list_stores(service: StoreService = Depends(get_store_service)) -> list[StoreRead]:
    stores = await service.list_stores()
    return [StoreRead.model_validate(store) for store in stores]


@router.get("/{store_id}/branches", response_model=list[StoreBranchRead])
async def list_store_branches(
    store_id: int, service: StoreService = Depends(get_store_service)
) -> list[StoreBranchRead]:
    branches = await service.list_branches(store_id)
    return [StoreBranchRead.model_validate(branch) for branch in branches]


@router.get("/branches/{branch_id}", response_model=StoreBranchWithStoreRead)
async def get_store_branch(
    branch_id: int, service: StoreService = Depends(get_store_service)
) -> StoreBranchWithStoreRead:
    branch = await service.get_branch(branch_id)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store branch not found")
    return StoreBranchWithStoreRead(
        id=branch.id,
        store_id=branch.store_id,
        name=branch.name,
        city=branch.city,
        store_name=branch.store.name,
    )
