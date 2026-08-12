from sqlalchemy.ext.asyncio import AsyncSession

from app.features.shopping_lists.models import ShoppingList, ShoppingListItem
from app.features.shopping_lists.repository import (
    ShoppingListItemRepository,
    ShoppingListRepository,
)


class ShoppingListService:
    def __init__(
        self,
        db: AsyncSession,
        lists: ShoppingListRepository,
        items: ShoppingListItemRepository,
    ) -> None:
        self.db = db
        self.lists = lists
        self.items = items

    async def list_owned_by(self, owner_user_id: int) -> list[ShoppingList]:
        return await self.lists.list_owned_by(owner_user_id)

    async def create(self, owner_user_id: int, name: str) -> ShoppingList:
        shopping_list = ShoppingList(owner_user_id=owner_user_id, name=name)
        await self.lists.add(shopping_list)
        await self.db.commit()
        return shopping_list

    async def add_item(
        self, shopping_list_id: int, product_id: int, quantity: int, added_by: int
    ) -> ShoppingListItem:
        item = ShoppingListItem(
            shopping_list_id=shopping_list_id,
            product_id=product_id,
            quantity=quantity,
            added_by=added_by,
        )
        await self.items.add(item)
        await self.db.commit()
        return item
