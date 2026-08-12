from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.shopping_lists.repository import (
    ShoppingListItemRepository,
    ShoppingListRepository,
)
from app.features.shopping_lists.schemas import (
    ShoppingListCreate,
    ShoppingListItemCreate,
    ShoppingListItemRead,
    ShoppingListRead,
)
from app.features.shopping_lists.service import ShoppingListService
from app.features.users.models import User

router = APIRouter(prefix="/shopping-lists", tags=["shopping_lists"])


def get_shopping_list_service(db: AsyncSession = Depends(get_db)) -> ShoppingListService:
    return ShoppingListService(db, ShoppingListRepository(db), ShoppingListItemRepository(db))


@router.get("", response_model=list[ShoppingListRead])
async def list_my_shopping_lists(
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> list[ShoppingListRead]:
    lists = await service.list_owned_by(current_user.id)
    return [ShoppingListRead.model_validate(item) for item in lists]


@router.post("", response_model=ShoppingListRead, status_code=status.HTTP_201_CREATED)
async def create_shopping_list(
    payload: ShoppingListCreate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListRead:
    shopping_list = await service.create(current_user.id, payload.name)
    return ShoppingListRead.model_validate(shopping_list)


@router.post(
    "/{shopping_list_id}/items",
    response_model=ShoppingListItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_shopping_list_item(
    shopping_list_id: int,
    payload: ShoppingListItemCreate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListItemRead:
    item = await service.add_item(
        shopping_list_id, payload.product_id, payload.quantity, current_user.id
    )
    return ShoppingListItemRead.model_validate(item)
