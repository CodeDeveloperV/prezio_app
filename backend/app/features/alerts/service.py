from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.alerts.exceptions import InvalidPriceAlertScope, PriceAlertAccessDenied, PriceAlertNotFound
from app.features.alerts.models import PriceAlert
from app.features.alerts.repository import PriceAlertRepository
from app.features.alerts.schemas import PriceAlertRead
from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.repository import ProductRepository
from app.features.stores.exceptions import StoreBranchNotFound, StoreNotFound
from app.features.stores.repository import StoreBranchRepository, StoreRepository


class PriceAlertService:
    """CRUD + ownership for price alerts. Evaluating whether an alert should fire lives in
    `PriceAlertEvaluator` instead -- that logic runs on a schedule, not per-request, and is kept
    separate on purpose (see AlertScheduler)."""

    def __init__(
        self,
        db: AsyncSession,
        alerts: PriceAlertRepository,
        products: ProductRepository,
        stores: StoreRepository,
        store_branches: StoreBranchRepository,
    ) -> None:
        self.db = db
        self.alerts = alerts
        self.products = products
        self.stores = stores
        self.store_branches = store_branches

    async def create(
        self,
        user_id: int,
        *,
        product_id: int,
        target_price: Decimal,
        store_id: int | None,
        store_branch_id: int | None,
    ) -> PriceAlert:
        if store_id is not None and store_branch_id is not None:
            raise InvalidPriceAlertScope("Set either store_id or store_branch_id, not both")

        if await self.products.get_by_id(product_id) is None:
            raise ProductNotFound(product_id)
        if store_id is not None and await self.stores.get_by_id(store_id) is None:
            raise StoreNotFound(store_id)
        if store_branch_id is not None and await self.store_branches.get_by_id(store_branch_id) is None:
            raise StoreBranchNotFound(store_branch_id)

        alert = PriceAlert(
            user_id=user_id,
            product_id=product_id,
            store_id=store_id,
            store_branch_id=store_branch_id,
            target_price=target_price,
        )
        await self.alerts.add(alert)
        await self.db.commit()
        return alert

    async def list_for_user(self, user_id: int) -> list[PriceAlertRead]:
        alerts = await self.alerts.list_by_user(user_id)
        product_ids = {alert.product_id for alert in alerts}
        products_by_id = {product.id: product for product in await self.products.list_by_ids(list(product_ids))}

        return [
            PriceAlertRead(
                id=alert.id,
                user_id=alert.user_id,
                product_id=alert.product_id,
                product_name=(
                    products_by_id[alert.product_id].canonical_name
                    if alert.product_id in products_by_id
                    else "Producto desconocido"
                ),
                store_id=alert.store_id,
                store_branch_id=alert.store_branch_id,
                target_price=alert.target_price,
                active=alert.active,
                is_below_threshold=alert.is_below_threshold,
                last_triggered_at=alert.last_triggered_at,
                created_at=alert.created_at,
                updated_at=alert.updated_at,
            )
            for alert in alerts
        ]

    async def update(
        self,
        alert_id: int,
        requesting_user_id: int,
        *,
        target_price: Decimal | None,
        active: bool | None,
    ) -> PriceAlert:
        alert = await self._get_owned(alert_id, requesting_user_id)
        if target_price is not None:
            alert.target_price = target_price
        if active is not None:
            alert.active = active
        await self.db.flush()
        await self.db.commit()
        return alert

    async def delete(self, alert_id: int, requesting_user_id: int) -> None:
        alert = await self._get_owned(alert_id, requesting_user_id)
        await self.alerts.delete(alert)
        await self.db.commit()

    async def _get_owned(self, alert_id: int, requesting_user_id: int) -> PriceAlert:
        alert = await self.alerts.get_by_id(alert_id)
        if alert is None:
            raise PriceAlertNotFound(alert_id)
        if alert.user_id != requesting_user_id:
            raise PriceAlertAccessDenied(alert_id)
        return alert
