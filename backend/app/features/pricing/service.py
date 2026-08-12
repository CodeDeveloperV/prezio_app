import json
from datetime import datetime, timezone
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.websocket_manager import PRICE_UPDATES_CHANNEL_PREFIX
from app.features.pricing.exceptions import PriceVersionConflict, StoreProductNotFound
from app.features.pricing.models import PriceConfirmation, PriceHistory, StoreProduct
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.features.reputation.enums import ReputationAction
from app.features.reputation.service import ReputationService


class PricingService:
    def __init__(
        self,
        db: AsyncSession,
        store_products: StoreProductRepository,
        price_history: PriceHistoryRepository,
        price_confirmations: PriceConfirmationRepository,
        redis: Redis,
        reputation: ReputationService,
    ) -> None:
        self.db = db
        self.store_products = store_products
        self.price_history = price_history
        self.price_confirmations = price_confirmations
        self.redis = redis
        self.reputation = reputation

    async def update_price(
        self,
        store_product_id: int,
        new_price: Decimal,
        expected_version: int,
        changed_by_user_id: int,
    ) -> StoreProduct:
        existing = await self.store_products.get_by_id(store_product_id)
        if existing is None:
            raise StoreProductNotFound(store_product_id)
        previous_price = existing.current_price

        updated = await self.store_products.update_price_if_version_matches(
            store_product_id, new_price, expected_version
        )

        if updated is None:
            current = await self.store_products.get_by_id(store_product_id)
            if current is None:
                raise StoreProductNotFound(store_product_id)
            raise PriceVersionConflict(current.current_price, current.version)

        await self.price_history.add(
            PriceHistory(
                store_product_id=store_product_id,
                previous_price=previous_price,
                new_price=new_price,
                updated_by=changed_by_user_id,
            )
        )
        # The optimistic-concurrency check above already guarantees this update wasn't racing
        # a stale read, so "correctly" here means "passed that check" -- no separate
        # correctness judgement is stored (same rationale as price confirmations).
        await self.reputation.award(
            user_id=changed_by_user_id,
            action=ReputationAction.UPDATE_PRICE,
            reference_type="store_product",
            reference_id=store_product_id,
        )
        await self.db.commit()

        await self._publish_price_update(updated)
        return updated

    async def confirm_match(self, store_product_id: int, confirmed_by_user_id: int) -> StoreProduct:
        """"✓ Coincide": every confirmation is a vote that the currently displayed price is
        accurate, so it's recorded as-is (who, when, at which branch, at what price) and counts
        toward the confirming user's reputation."""
        now = datetime.now(timezone.utc)
        updated = await self.store_products.mark_verified(store_product_id, now, confirmed_by_user_id)
        if updated is None:
            raise StoreProductNotFound(store_product_id)

        await self.price_confirmations.add(
            PriceConfirmation(
                store_product_id=updated.id,
                store_branch_id=updated.store_branch_id,
                confirmed_by=confirmed_by_user_id,
                confirmed_price=updated.current_price,
                confirmed_at=now,
            )
        )
        await self.reputation.award(
            user_id=confirmed_by_user_id,
            action=ReputationAction.CONFIRM_PRICE,
            reference_type="store_product",
            reference_id=store_product_id,
        )
        await self.db.commit()
        return updated

    async def list_price_history(self, store_product_id: int) -> list[PriceHistory]:
        existing = await self.store_products.get_by_id(store_product_id)
        if existing is None:
            raise StoreProductNotFound(store_product_id)
        return await self.price_history.list_by_store_product(store_product_id)

    async def get_reputation(self, user_id: int) -> int:
        return await self.price_confirmations.count_by_user(user_id)

    async def _publish_price_update(self, store_product: StoreProduct) -> None:
        channel = f"{PRICE_UPDATES_CHANNEL_PREFIX}{store_product.id}"
        payload = json.dumps(
            {
                "store_product_id": store_product.id,
                "price": str(store_product.current_price),
                "version": store_product.version,
            }
        )
        await self.redis.publish(channel, payload)
