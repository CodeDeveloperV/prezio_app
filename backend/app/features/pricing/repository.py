from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import selectinload

from app.features.pricing.enums import Availability, StoreProductStatus
from app.features.pricing.models import PriceConfirmation, PriceHistory, StoreProduct
from app.features.users.models import User
from app.shared.base_repository import BaseRepository


class PriceHistoryRepository(BaseRepository[PriceHistory]):
    model = PriceHistory

    async def list_by_store_product(self, store_product_id: int) -> list[PriceHistory]:
        # Ordered by id (not updated_at) since two updates in the same request burst can land
        # on the same timestamp at second-level column precision -- id is monotonic regardless.
        # selectinload batches the user (and their profile) in two extra queries total,
        # regardless of how many history rows are returned -- not one query per row.
        result = await self.session.execute(
            select(PriceHistory)
            .where(PriceHistory.store_product_id == store_product_id)
            .order_by(PriceHistory.id.desc())
            .options(selectinload(PriceHistory.updated_by_user).selectinload(User.profile))
        )
        return list(result.scalars().all())

    async def list_latest_by_store_products(self, store_product_ids: list[int]) -> dict[int, PriceHistory]:
        """One (most recent) `PriceHistory` row per store_product_id -- backs the pricing list
        screen's "precio anterior" / "actualizado por" / "origen" columns without a query per row."""
        if not store_product_ids:
            return {}
        result = await self.session.execute(
            select(PriceHistory)
            .where(PriceHistory.store_product_id.in_(store_product_ids))
            .order_by(PriceHistory.id.desc())
            .options(selectinload(PriceHistory.updated_by_user).selectinload(User.profile))
        )
        latest: dict[int, PriceHistory] = {}
        for entry in result.scalars().all():
            latest.setdefault(entry.store_product_id, entry)  # id desc: first seen per id is the latest
        return latest

    async def reassign_store_product(self, old_store_product_id: int, new_store_product_id: int) -> int:
        """Re-parents every PriceHistory row from `old_store_product_id` onto
        `new_store_product_id` -- used by a product merge so the target keeps 100% of the
        source's price history even though the source's StoreProduct row is deleted."""
        result = await self.session.execute(
            update(PriceHistory)
            .where(PriceHistory.store_product_id == old_store_product_id)
            .values(store_product_id=new_store_product_id)
        )
        return result.rowcount


class StoreProductRepository(BaseRepository[StoreProduct]):
    model = StoreProduct

    async def get_by_branch_and_product(self, store_branch_id: int, product_id: int) -> StoreProduct | None:
        result = await self.session.execute(
            select(StoreProduct).where(
                StoreProduct.store_branch_id == store_branch_id,
                StoreProduct.product_id == product_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_fields_if_version_matches(
        self,
        store_product_id: int,
        expected_version: int,
        *,
        price: Decimal | None = None,
        availability: Availability | None = None,
    ) -> StoreProduct | None:
        """Atomic `UPDATE ... WHERE id = ? AND version = ?`, touching only the fields the
        caller actually passed (price and/or availability share one `version` so a price
        change and an availability change can't silently overwrite each other's update).

        This is what actually enforces optimistic concurrency: the WHERE clause is
        evaluated by the database in the same statement as the write, so two concurrent
        requests starting from the same version can't both succeed -- only one UPDATE
        matches a row, the other affects zero rows.
        """
        values: dict = {"version": StoreProduct.version + 1}
        if price is not None:
            values["current_price"] = price
        if availability is not None:
            values["availability"] = availability

        result = await self.session.execute(
            update(StoreProduct)
            .where(
                StoreProduct.id == store_product_id,
                StoreProduct.version == expected_version,
            )
            .values(**values)
            .execution_options(synchronize_session="fetch")
        )
        if result.rowcount == 0:
            return None

        await self.session.flush()
        updated = await self.session.get(StoreProduct, store_product_id)
        assert updated is not None
        # `updated_at` is server-computed (onupdate=func.now()) and not part of `values()`, so
        # the ORM's fetch-sync leaves it individually expired rather than repopulated -- a plain
        # `session.get()` on an object that's merely attribute-expired (not absent) won't reload
        # it, and any later *unawaited* access to that attribute raises MissingGreenlet. An
        # explicit refresh forces the reload here, inside an awaited call.
        await self.session.refresh(updated)
        return updated

    async def list_by_ids(self, store_product_ids: list[int]) -> list[StoreProduct]:
        if not store_product_ids:
            return []
        result = await self.session.execute(select(StoreProduct).where(StoreProduct.id.in_(store_product_ids)))
        return list(result.scalars().all())

    async def list_by_branches(
        self,
        store_branch_ids: list[int],
        *,
        status: StoreProductStatus | None = StoreProductStatus.ACTIVE,
        availability: Availability | None = None,
        product_ids: list[int] | None = None,
        stale_before: datetime | None = None,
    ) -> list[StoreProduct]:
        """Backs the B2B pricing list screen: every listing across the caller's accessible
        branches, narrowed by the same StoreProduct-side filters as the UI's filter bar.
        `product_ids=None` means "no name/barcode/category filter"; `product_ids=[]` (an
        already-empty catalog search result) short-circuits to no rows rather than dropping
        the filter."""
        if not store_branch_ids or product_ids == []:
            return []

        stmt = select(StoreProduct).where(StoreProduct.store_branch_id.in_(store_branch_ids))
        if status is not None:
            stmt = stmt.where(StoreProduct.status == status)
        if availability is not None:
            stmt = stmt.where(StoreProduct.availability == availability)
        if product_ids is not None:
            stmt = stmt.where(StoreProduct.product_id.in_(product_ids))
        if stale_before is not None:
            stmt = stmt.where(
                or_(StoreProduct.last_verified_at.is_(None), StoreProduct.last_verified_at < stale_before)
            )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_product(self, product_id: int) -> list[StoreProduct]:
        result = await self.session.execute(select(StoreProduct).where(StoreProduct.product_id == product_id))
        return list(result.scalars().all())

    async def list_by_branches_and_products(
        self, store_branch_ids: list[int], product_ids: list[int]
    ) -> list[StoreProduct]:
        """Bulk lookup backing the store comparator: one query for every (branch, product)
        listing across all candidate branches, instead of N+1 `get_by_branch_and_product` calls."""
        if not store_branch_ids or not product_ids:
            return []
        result = await self.session.execute(
            select(StoreProduct).where(
                StoreProduct.store_branch_id.in_(store_branch_ids),
                StoreProduct.product_id.in_(product_ids),
            )
        )
        return list(result.scalars().all())

    async def mark_verified(
        self, store_product_id: int, verified_at: datetime, verified_by: int
    ) -> StoreProduct | None:
        """"✓ Coincide": records that a user confirmed the displayed price is still accurate.
        Deliberately does not touch `current_price`/`version`/PriceHistory -- the price itself
        didn't change, only its verification timestamp."""
        store_product = await self.get_by_id(store_product_id)
        if store_product is None:
            return None
        store_product.last_verified_at = verified_at
        store_product.last_verified_by = verified_by
        await self.session.flush()
        return store_product


class PriceConfirmationRepository(BaseRepository[PriceConfirmation]):
    model = PriceConfirmation

    async def count_by_user(self, user_id: int) -> int:
        result = await self.session.execute(
            select(func.count()).where(PriceConfirmation.confirmed_by == user_id)
        )
        return result.scalar_one()

    async def reassign_store_product(self, old_store_product_id: int, new_store_product_id: int) -> int:
        """Re-parents every PriceConfirmation row from `old_store_product_id` onto
        `new_store_product_id` -- used by a product merge so confirmations (and the
        reputation counts derived from them) survive the source StoreProduct's deletion."""
        result = await self.session.execute(
            update(PriceConfirmation)
            .where(PriceConfirmation.store_product_id == old_store_product_id)
            .values(store_product_id=new_store_product_id)
        )
        return result.rowcount
