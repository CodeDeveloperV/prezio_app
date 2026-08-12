from sqlalchemy import select

from app.features.shopping_lists.models import ShoppingList, ShoppingListItem
from app.shared.base_repository import BaseRepository


class ShoppingListRepository(BaseRepository[ShoppingList]):
    model = ShoppingList

    async def list_owned_by(self, owner_user_id: int) -> list[ShoppingList]:
        result = await self.session.execute(
            select(ShoppingList).where(ShoppingList.owner_user_id == owner_user_id)
        )
        return list(result.scalars().all())


class ShoppingListItemRepository(BaseRepository[ShoppingListItem]):
    model = ShoppingListItem

    async def list_by_shopping_list(self, shopping_list_id: int) -> list[ShoppingListItem]:
        result = await self.session.execute(
            select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list_id)
        )
        return list(result.scalars().all())
