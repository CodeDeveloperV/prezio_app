from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, delete, select, update

from app.features.shopping_lists.enums import ShoppingListInvitationStatus, ShoppingListStatus
from app.features.shopping_lists.models import (
    ShoppingList,
    ShoppingListInvitation,
    ShoppingListItem,
    ShoppingListMember,
)
from app.features.catalog.models import Brand, Product
from app.features.pricing.models import StoreProduct
from app.features.stores.models import Store, StoreBranch
from app.shared.base_repository import BaseRepository


class ShoppingListRepository(BaseRepository[ShoppingList]):
    model = ShoppingList

    async def get_by_client_request_id(self, owner_user_id: int, client_request_id: str) -> ShoppingList | None:
        result = await self.session.execute(
            select(ShoppingList).where(
                ShoppingList.owner_user_id == owner_user_id,
                ShoppingList.client_request_id == client_request_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_member(self, user_id: int, *, include_archived: bool = False) -> list[ShoppingList]:
        query = (
            select(ShoppingList)
            .join(ShoppingListMember, ShoppingListMember.shopping_list_id == ShoppingList.id)
            .where(ShoppingListMember.user_id == user_id)
        )
        if not include_archived:
            query = query.where(ShoppingList.status == ShoppingListStatus.ACTIVE)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def set_active_branch(self, shopping_list_id: int, store_branch_id: int | None) -> None:
        await self.session.execute(
            update(ShoppingList)
            .where(ShoppingList.id == shopping_list_id)
            .values(active_store_branch_id=store_branch_id)
        )
        await self.session.flush()

    async def get_with_active_branch(self, shopping_list_id: int) -> tuple[ShoppingList, StoreBranch | None, Store | None] | None:
        """Loads the list and its selected branch/chain in one query for the purchase summary."""
        result = await self.session.execute(
            select(ShoppingList, StoreBranch, Store)
            .outerjoin(StoreBranch, StoreBranch.id == ShoppingList.active_store_branch_id)
            .outerjoin(Store, Store.id == StoreBranch.store_id)
            .where(ShoppingList.id == shopping_list_id)
        )
        row = result.one_or_none()
        if row is None:
            return None
        shopping_list, branch, store = row
        return shopping_list, branch, store


class ShoppingListItemRepository(BaseRepository[ShoppingListItem]):
    model = ShoppingListItem

    async def list_by_shopping_list(self, shopping_list_id: int) -> list[ShoppingListItem]:
        result = await self.session.execute(
            select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list_id)
        )
        return list(result.scalars().all())

    async def list_summary_rows(
        self, shopping_list_id: int, active_store_branch_id: int | None
    ) -> list[tuple[ShoppingListItem, Product | None, Brand | None, StoreProduct | None]]:
        """Bulk-resolves list items and only the selected branch's listing.

        The join is intentionally based on ``product_id + active_store_branch_id``. Barcodes
        never participate in this read model, and no price from another branch can join it.
        """
        store_product_join = and_(
            StoreProduct.product_id == ShoppingListItem.product_id,
            StoreProduct.store_branch_id == active_store_branch_id,
        )
        result = await self.session.execute(
            select(ShoppingListItem, Product, Brand, StoreProduct)
            .outerjoin(Product, Product.id == ShoppingListItem.product_id)
            .outerjoin(Brand, Brand.id == Product.brand_id)
            .outerjoin(StoreProduct, store_product_join)
            .where(ShoppingListItem.shopping_list_id == shopping_list_id)
            .order_by(ShoppingListItem.id.asc())
        )
        return list(result.tuples().all())

    async def delete_all_for_list(self, shopping_list_id: int) -> None:
        await self.session.execute(delete(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list_id))

    async def get_by_client_request_id(
        self, shopping_list_id: int, client_request_id: str
    ) -> ShoppingListItem | None:
        result = await self.session.execute(
            select(ShoppingListItem).where(
                ShoppingListItem.shopping_list_id == shopping_list_id,
                ShoppingListItem.client_request_id == client_request_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_if_version_matches(
        self,
        item_id: int,
        expected_version: int,
        *,
        quantity: int | None = None,
        checked: bool | None = None,
        update_checked_snapshot: bool = False,
        checked_at: datetime | None = None,
        price_at_check: Decimal | None = None,
        store_branch_id: int | None = None,
    ) -> ShoppingListItem | None:
        """Atomic `UPDATE ... WHERE id = ? AND version = ?`, same optimistic-concurrency pattern
        as StoreProductRepository.update_price_if_version_matches (pricing) -- no new mechanism.

        `update_checked_snapshot` is a separate flag (rather than inferring from
        checked_at/price_at_check being non-None) because clearing the snapshot back to null --
        when an item is unchecked -- is itself a valid write, distinct from "don't touch these
        columns"."""
        values: dict[str, object] = {"version": ShoppingListItem.version + 1}
        if quantity is not None:
            values["quantity"] = quantity
        if checked is not None:
            values["checked"] = checked
        if update_checked_snapshot:
            values["checked_at"] = checked_at
            values["price_at_check"] = price_at_check
            values["store_branch_id"] = store_branch_id

        result = await self.session.execute(
            update(ShoppingListItem)
            .where(ShoppingListItem.id == item_id, ShoppingListItem.version == expected_version)
            .values(**values)
            .execution_options(synchronize_session="fetch")
        )
        if result.rowcount == 0:
            return None

        await self.session.flush()
        return await self.session.get(ShoppingListItem, item_id)


class ShoppingListMemberRepository(BaseRepository[ShoppingListMember]):
    model = ShoppingListMember

    async def get_for_list_and_user(self, shopping_list_id: int, user_id: int) -> ShoppingListMember | None:
        result = await self.session.execute(
            select(ShoppingListMember).where(
                ShoppingListMember.shopping_list_id == shopping_list_id,
                ShoppingListMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_shopping_list(self, shopping_list_id: int) -> list[ShoppingListMember]:
        result = await self.session.execute(
            select(ShoppingListMember).where(ShoppingListMember.shopping_list_id == shopping_list_id)
        )
        return list(result.scalars().all())

    async def delete_all_for_list(self, shopping_list_id: int) -> None:
        await self.session.execute(
            delete(ShoppingListMember).where(ShoppingListMember.shopping_list_id == shopping_list_id)
        )


class ShoppingListInvitationRepository(BaseRepository[ShoppingListInvitation]):
    model = ShoppingListInvitation

    async def get_pending_for_list_and_email(
        self, shopping_list_id: int, invited_email: str
    ) -> ShoppingListInvitation | None:
        result = await self.session.execute(
            select(ShoppingListInvitation).where(
                ShoppingListInvitation.shopping_list_id == shopping_list_id,
                ShoppingListInvitation.invited_email == invited_email,
                ShoppingListInvitation.status == ShoppingListInvitationStatus.PENDING,
            )
        )
        return result.scalar_one_or_none()

    async def list_pending_for_user(self, user_id: int) -> list[ShoppingListInvitation]:
        result = await self.session.execute(
            select(ShoppingListInvitation).where(
                ShoppingListInvitation.invited_user_id == user_id,
                ShoppingListInvitation.status == ShoppingListInvitationStatus.PENDING,
            )
        )
        return list(result.scalars().all())

    async def delete_all_for_list(self, shopping_list_id: int) -> None:
        await self.session.execute(
            delete(ShoppingListInvitation).where(ShoppingListInvitation.shopping_list_id == shopping_list_id)
        )
