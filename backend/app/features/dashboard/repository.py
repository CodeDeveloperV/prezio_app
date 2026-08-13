from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.models import Product
from app.features.pricing.models import PriceHistory, StoreProduct
from app.features.shopping_lists.models import ShoppingListItem, ShoppingListMember


class DashboardRepository:
    """Read-only aggregation queries backing the dashboard summary. Deliberately does not
    subclass BaseRepository -- there's no single owned model here, only cross-feature reads over
    shopping_list_items/products/price_history scoped to a user's list memberships.

    Date-range filtering and grouping is done in Python (see DashboardService), not in SQL --
    matching the pattern already used by the alert evaluator -- so this repository fetches raw
    rows rather than doing date_trunc/BETWEEN queries that behave differently between the
    project's SQLite test database and Postgres in production.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_checked_items_for_user(self, user_id: int) -> list[ShoppingListItem]:
        result = await self.session.execute(
            select(ShoppingListItem)
            .join(ShoppingListMember, ShoppingListMember.shopping_list_id == ShoppingListItem.shopping_list_id)
            .where(
                ShoppingListMember.user_id == user_id,
                ShoppingListItem.checked_at.is_not(None),
            )
        )
        return list(result.scalars().all())

    async def most_purchased_products(self, user_id: int, limit: int) -> list[tuple[int, str, int]]:
        result = await self.session.execute(
            select(
                Product.id,
                Product.canonical_name,
                func.sum(ShoppingListItem.quantity),
            )
            .join(ShoppingListMember, ShoppingListMember.shopping_list_id == ShoppingListItem.shopping_list_id)
            .join(Product, Product.id == ShoppingListItem.product_id)
            .where(
                ShoppingListMember.user_id == user_id,
                ShoppingListItem.checked_at.is_not(None),
            )
            .group_by(Product.id, Product.canonical_name)
            .order_by(func.sum(ShoppingListItem.quantity).desc())
            .limit(limit)
        )
        return [(row[0], row[1], int(row[2])) for row in result.all()]

    async def last_purchase(self, user_id: int) -> tuple[ShoppingListItem, str] | None:
        result = await self.session.execute(
            select(ShoppingListItem, Product.canonical_name)
            .join(ShoppingListMember, ShoppingListMember.shopping_list_id == ShoppingListItem.shopping_list_id)
            .join(Product, Product.id == ShoppingListItem.product_id)
            .where(
                ShoppingListMember.user_id == user_id,
                ShoppingListItem.checked_at.is_not(None),
            )
            .order_by(ShoppingListItem.checked_at.desc())
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None
        item, product_name = row
        return item, product_name

    async def price_history_for_products(self, product_ids: list[int]) -> list[tuple[int, datetime, Decimal]]:
        """(product_id, updated_at, new_price) rows across every store that has ever listed the
        product -- the raw material DashboardService uses to compute a "what would I have paid
        otherwise" reference price per product/month."""
        if not product_ids:
            return []
        result = await self.session.execute(
            select(StoreProduct.product_id, PriceHistory.updated_at, PriceHistory.new_price)
            .join(StoreProduct, StoreProduct.id == PriceHistory.store_product_id)
            .where(StoreProduct.product_id.in_(product_ids))
        )
        return list(result.all())
