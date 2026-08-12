from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.alerts.models import PriceAlert
from app.features.alerts.repository import PriceAlertRepository
from app.features.catalog.repository import ProductRepository
from app.features.notifications.enums import NotificationType
from app.features.notifications.service import NotificationService
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.stores.repository import StoreBranchRepository


class PriceAlertEvaluator:
    """One evaluation pass over every active price alert. Deliberately has no idea *how often*
    or *by what mechanism* it gets invoked -- see `app.core.alert_scheduler.AlertScheduler` for
    the asyncio loop that calls `run_once` today. Swapping that loop for Celery/cron/a dedicated
    worker later only changes who calls `run_once`; this class doesn't change.
    """

    def __init__(
        self,
        db: AsyncSession,
        alerts: PriceAlertRepository,
        store_products: StoreProductRepository,
        store_branches: StoreBranchRepository,
        products: ProductRepository,
        notifications: NotificationService,
        *,
        price_freshness_days: int,
    ) -> None:
        self.db = db
        self.alerts = alerts
        self.store_products = store_products
        self.store_branches = store_branches
        self.products = products
        self.notifications = notifications
        self.price_freshness_days = price_freshness_days

    async def run_once(self) -> int:
        """Evaluates every active alert; returns how many notifications were created."""
        alerts = await self.alerts.list_active()
        triggered_count = 0
        for alert in alerts:
            if await self._evaluate_alert(alert):
                triggered_count += 1
        return triggered_count

    async def _evaluate_alert(self, alert: PriceAlert) -> bool:
        candidates = await self._resolve_candidates(alert)
        fresh_valid = [sp for sp in candidates if self._is_fresh_and_valid(sp)]

        if not fresh_valid:
            # No usable price data this cycle (missing or stale-only) -- must not trigger, and
            # must not rearm either: rearming on missing data would be a decision based on
            # nothing, not on the price actually rising back above target.
            return False

        cheapest = min(fresh_valid, key=lambda sp: sp.current_price)

        if cheapest.current_price < alert.target_price:
            claimed = await self.alerts.try_claim_trigger(alert.id)
            if claimed is None:
                # Already below target (no re-notify) or another evaluator just claimed it.
                await self.db.commit()
                return False
            await self._notify(alert, cheapest)
            await self.db.commit()
            return True

        await self.alerts.rearm(alert.id)
        await self.db.commit()
        return False

    async def _resolve_candidates(self, alert: PriceAlert) -> list[StoreProduct]:
        if alert.store_branch_id is not None:
            store_product = await self.store_products.get_by_branch_and_product(
                alert.store_branch_id, alert.product_id
            )
            return [store_product] if store_product is not None else []

        if alert.store_id is not None:
            branches = await self.store_branches.list_by_store(alert.store_id)
            branch_ids = {branch.id for branch in branches}
            return [
                sp
                for sp in await self.store_products.list_by_product(alert.product_id)
                if sp.store_branch_id in branch_ids
            ]

        return await self.store_products.list_by_product(alert.product_id)

    def _is_fresh_and_valid(self, store_product: StoreProduct) -> bool:
        if store_product.current_price is None or store_product.current_price <= 0:
            return False

        last_verified_at = store_product.last_verified_at
        if last_verified_at is None:
            return False
        # SQLite (used in tests) drops tzinfo on read-back even for a `DateTime(timezone=True)`
        # column -- same fixup as ComparisonService._resolve_line_status.
        if last_verified_at.tzinfo is None:
            last_verified_at = last_verified_at.replace(tzinfo=timezone.utc)

        freshness_cutoff = datetime.now(timezone.utc) - timedelta(days=self.price_freshness_days)
        return last_verified_at >= freshness_cutoff

    async def _notify(self, alert: PriceAlert, store_product: StoreProduct) -> None:
        product = await self.products.get_by_id(alert.product_id)
        product_name = product.canonical_name if product is not None else "Producto"

        await self.notifications.create(
            user_id=alert.user_id,
            type=NotificationType.PRICE_ALERT,
            title=f"{product_name} bajó de precio",
            message=(
                f"{product_name} está a ${store_product.current_price} "
                f"(tu meta era ${alert.target_price})."
            ),
            related_entity_type="product",
            related_entity_id=alert.product_id,
            alert_id=alert.id,
            metadata={
                "store_product_id": store_product.id,
                "store_branch_id": store_product.store_branch_id,
                "price": str(store_product.current_price),
                "target_price": str(alert.target_price),
            },
        )
