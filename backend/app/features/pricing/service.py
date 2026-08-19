import json
import logging
from datetime import datetime, timezone
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.websocket_manager import PRICE_UPDATES_CHANNEL_PREFIX
from app.features.pricing.enums import Availability, PriceUpdateSource
from app.features.pricing.exceptions import PriceVersionConflict, StoreProductNotFound
from app.features.pricing.models import PriceConfirmation, PriceHistory, StoreProduct
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.features.pricing.schemas import PriceHistoryRead, PriceHistoryUpdatedByRead
from app.features.reputation.enums import ReputationAction
from app.features.reputation.service import ReputationService

logger = logging.getLogger(__name__)


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
        """Community/mobile price update: always source=COMMUNITY and always awards
        reputation. The B2B portal (Fase 10.6) goes through `apply_update` directly with
        source=MERCHANT and no reputation, since a staff member doing their job shouldn't
        gain crowdsourced-trust points -- see `B2BPricingService`."""
        return await self.apply_update(
            store_product_id,
            price=new_price,
            availability=None,
            expected_version=expected_version,
            changed_by_user_id=changed_by_user_id,
            source=PriceUpdateSource.COMMUNITY,
            award_reputation=True,
        )

    async def apply_update(
        self,
        store_product_id: int,
        *,
        price: Decimal | None,
        availability: Availability | None,
        expected_version: int,
        changed_by_user_id: int,
        source: PriceUpdateSource,
        award_reputation: bool,
    ) -> StoreProduct:
        """Shared primitive behind both the community `update_price` and the B2B portal's
        price/availability updates: one optimistic-concurrency check covers whichever of
        `price`/`availability` was actually sent, so a price edit and an availability edit
        against the same `version` can't silently clobber each other."""
        existing = await self.store_products.get_by_id(store_product_id)
        if existing is None:
            raise StoreProductNotFound(store_product_id)
        previous_price = existing.current_price

        updated = await self.store_products.update_fields_if_version_matches(
            store_product_id, expected_version, price=price, availability=availability
        )

        if updated is None:
            current = await self.store_products.get_by_id(store_product_id)
            if current is None:
                raise StoreProductNotFound(store_product_id)
            logger.warning(
                "Pricing conflict: store_product_id=%d expected_version=%d actual_version=%d",
                store_product_id,
                expected_version,
                current.version,
            )
            raise PriceVersionConflict(current.current_price, current.version, current.availability)

        if price is not None:
            await self.price_history.add(
                PriceHistory(
                    store_product_id=store_product_id,
                    previous_price=previous_price,
                    new_price=price,
                    updated_by=changed_by_user_id,
                    source=source,
                )
            )
            if award_reputation:
                # The optimistic-concurrency check above already guarantees this update wasn't
                # racing a stale read, so "correctly" here means "passed that check" -- no
                # separate correctness judgement is stored (same rationale as price confirmations).
                await self.reputation.award(
                    user_id=changed_by_user_id,
                    action=ReputationAction.UPDATE_PRICE,
                    reference_type="store_product",
                    reference_id=store_product_id,
                )
        await self.db.commit()

        await self._publish_price_update(updated, source=source)
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
        # Reuse the same StoreProduct channel; clients that only understand price updates ignore
        # the additive verification metadata while newer clients can refresh freshness UI.
        await self._publish_price_update(updated, source=PriceUpdateSource.COMMUNITY)
        return updated

    async def list_price_history(self, store_product_id: int) -> list[PriceHistoryRead]:
        existing = await self.store_products.get_by_id(store_product_id)
        if existing is None:
            raise StoreProductNotFound(store_product_id)
        history = await self.price_history.list_by_store_product(store_product_id)
        return [self._to_history_read(entry) for entry in history]

    def _to_history_read(self, entry: PriceHistory) -> PriceHistoryRead:
        updated_by = None
        if entry.updated_by_user is not None:
            user = entry.updated_by_user
            display_name = user.profile.display_name.strip() if user.profile and user.profile.display_name else ""
            updated_by = PriceHistoryUpdatedByRead(
                user_id=user.id,
                display_name=display_name or None,
                email=user.email,
            )
        return PriceHistoryRead(
            id=entry.id,
            store_product_id=entry.store_product_id,
            previous_price=entry.previous_price,
            new_price=entry.new_price,
            updated_by=updated_by,
            source=entry.source,
            updated_at=entry.updated_at,
        )

    async def get_reputation(self, user_id: int) -> int:
        return await self.price_confirmations.count_by_user(user_id)

    async def _publish_price_update(self, store_product: StoreProduct, source: PriceUpdateSource) -> None:
        channel = f"{PRICE_UPDATES_CHANNEL_PREFIX}{store_product.id}"
        # `price`/`version` are the original wire shape existing consumers (mobile, the price-
        # comparator WS) already parse -- `availability`/`source` are additive so they keep
        # working unchanged; only clients that care about Fase 10.6 need to read the new keys.
        payload = json.dumps(
            {
                "store_product_id": store_product.id,
                "price": str(store_product.current_price),
                "version": store_product.version,
                "availability": store_product.availability.value,
                "source": source.value,
                "last_verified_at": store_product.last_verified_at.isoformat() if store_product.last_verified_at else None,
                "last_verified_by": store_product.last_verified_by,
            }
        )
        await self.redis.publish(channel, payload)
