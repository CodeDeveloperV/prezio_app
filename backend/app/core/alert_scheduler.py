import asyncio
import logging

from app.core.config import get_settings
from app.core.db import AsyncSessionLocal
from app.core.distributed_lock import DistributedLock
from app.core.redis import get_redis
from app.features.alerts.dependencies import build_price_alert_evaluator

logger = logging.getLogger(__name__)

ALERT_CHECK_LOCK_KEY = "alerts:check_lock"
# Lock TTL is longer than the check interval so a cycle that runs a little long doesn't let a
# second instance start overlapping work -- if a holder dies mid-cycle, the lock still
# self-expires and the next instance's cycle picks it up.
ALERT_CHECK_LOCK_TTL_SECONDS = 300


class AlertScheduler:
    """Runs one PriceAlertEvaluator pass every `alert_check_interval_seconds`.

    This is pure scheduling mechanics -- a plain asyncio loop guarded by a Redis distributed
    lock so multiple API instances don't all evaluate the same alerts every cycle. It knows
    nothing about alert/notification domain logic (that's `PriceAlertEvaluator`), so replacing
    this loop with Celery beat, a cron job, or a dedicated worker process later is a matter of
    calling `PriceAlertEvaluator.run_once()` from wherever that new scheduler lives -- no change
    to the evaluator itself.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    async def _run_cycle(self) -> None:
        settings = get_settings()
        lock = DistributedLock(get_redis(), ALERT_CHECK_LOCK_KEY, ttl_seconds=ALERT_CHECK_LOCK_TTL_SECONDS)

        async with lock.try_lock() as acquired:
            if not acquired:
                return
            async with AsyncSessionLocal() as db:
                evaluator = build_price_alert_evaluator(db)
                try:
                    triggered_count = await evaluator.run_once()
                    if triggered_count:
                        logger.info("Price alert check: %d alert(s) triggered", triggered_count)
                except Exception:
                    logger.exception("Price alert check cycle failed")
                    await db.rollback()

    async def _loop(self) -> None:
        settings = get_settings()
        try:
            while True:
                await self._run_cycle()
                await asyncio.sleep(settings.alert_check_interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Alert scheduler loop crashed, price alerts will stop being checked")

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


alert_scheduler = AlertScheduler()
