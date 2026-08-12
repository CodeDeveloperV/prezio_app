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
