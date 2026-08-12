from sqlalchemy import func, select, update

from app.features.alerts.models import PriceAlert
from app.shared.base_repository import BaseRepository


class PriceAlertRepository(BaseRepository[PriceAlert]):
    model = PriceAlert

    async def list_by_user(self, user_id: int) -> list[PriceAlert]:
        result = await self.session.execute(
            select(PriceAlert).where(PriceAlert.user_id == user_id).order_by(PriceAlert.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_active(self) -> list[PriceAlert]:
        result = await self.session.execute(select(PriceAlert).where(PriceAlert.active.is_(True)))
        return list(result.scalars().all())

    async def try_claim_trigger(self, alert_id: int) -> PriceAlert | None:
        """Atomic `UPDATE ... WHERE is_below_threshold = false AND active = true`.

        This is the idempotency guard the evaluator relies on: two evaluator passes racing on
        the same alert (e.g. two API instances whose distributed lock windows briefly overlap)
        can both decide "this alert should trigger", but only one UPDATE statement matches a
        row -- the other gets rowcount 0 and must not create a duplicate notification.
        """
        result = await self.session.execute(
            update(PriceAlert)
            .where(
                PriceAlert.id == alert_id,
                PriceAlert.is_below_threshold.is_(False),
                PriceAlert.active.is_(True),
            )
            .values(is_below_threshold=True, last_triggered_at=func.now())
            .execution_options(synchronize_session="fetch")
        )
        if result.rowcount == 0:
            return None

        await self.session.flush()
        return await self.session.get(PriceAlert, alert_id)

    async def rearm(self, alert_id: int) -> PriceAlert | None:
        """Atomic `UPDATE ... WHERE is_below_threshold = true`: resets the alert once the price
        rises back above target, so the next crossing below notifies again. Not itself a
        triggering event, so no notification is created here.
        """
        result = await self.session.execute(
            update(PriceAlert)
            .where(PriceAlert.id == alert_id, PriceAlert.is_below_threshold.is_(True))
            .values(is_below_threshold=False)
            .execution_options(synchronize_session="fetch")
        )
        if result.rowcount == 0:
            return None

        await self.session.flush()
        return await self.session.get(PriceAlert, alert_id)
