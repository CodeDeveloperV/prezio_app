from sqlalchemy import select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.models import Category, Product
from app.features.shopping_lists.models import ShoppingListItem, ShoppingListMember
from app.features.stores.models import Store, StoreBranch


class AnalyticsRepository:
    """Read-only aggregation queries backing Epic 13's personal analytics. Deliberately does not
    subclass BaseRepository -- same rationale as DashboardRepository (dashboard/repository.py):
    there's no single owned model, only cross-feature reads scoped to a user's list memberships.

    Fetches every checked item once, unfiltered by date, and lets AnalyticsService do period
    filtering/bucketing in Python -- matching the project-wide convention (see dashboard and the
    alert evaluator) of avoiding SQL date-range/date-trunc functions that behave differently
    between the test suite's SQLite and production Postgres.

    This is intentionally a broader join than DashboardRepository.list_checked_items_for_user
    (adds Category and Store/StoreBranch) because analytics needs store- and category-level
    breakdowns dashboard doesn't; the two queries were not merged to avoid changing Epic 9's
    existing contract for no benefit (see Epic 13 implementation notes for detail)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_checked_items_for_user(self, user_id: int) -> list[Row]:
        result = await self.session.execute(
            select(
                ShoppingListItem,
                Product.canonical_name.label("product_name"),
                Product.category_id.label("category_id"),
                Category.name.label("category_name"),
                Store.id.label("store_id"),
                Store.name.label("store_name"),
                StoreBranch.id.label("store_branch_id"),
                StoreBranch.name.label("branch_name"),
            )
            .join(ShoppingListMember, ShoppingListMember.shopping_list_id == ShoppingListItem.shopping_list_id)
            .join(Product, Product.id == ShoppingListItem.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .outerjoin(StoreBranch, StoreBranch.id == ShoppingListItem.store_branch_id)
            .outerjoin(Store, Store.id == StoreBranch.store_id)
            .where(
                ShoppingListMember.user_id == user_id,
                ShoppingListItem.checked_at.is_not(None),
            )
        )
        return list(result.all())
