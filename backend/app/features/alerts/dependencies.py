from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.features.alerts.evaluator import PriceAlertEvaluator
from app.features.alerts.repository import PriceAlertRepository
from app.features.catalog.repository import ProductRepository
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.service import NotificationService
from app.features.pricing.repository import StoreProductRepository
from app.features.stores.repository import StoreBranchRepository


def build_price_alert_evaluator(db: AsyncSession) -> PriceAlertEvaluator:
    """Builds a `PriceAlertEvaluator` from a plain `AsyncSession` -- used by `AlertScheduler`,
    which runs outside any FastAPI request and so has no request-scoped DI to lean on (see
    `app.core.db.AsyncSessionLocal`, opened directly per evaluation cycle)."""
    settings = get_settings()
    return PriceAlertEvaluator(
        db,
        PriceAlertRepository(db),
        StoreProductRepository(db),
        StoreBranchRepository(db),
        ProductRepository(db),
        NotificationService(db, NotificationRepository(db)),
        price_freshness_days=settings.price_freshness_days,
    )
