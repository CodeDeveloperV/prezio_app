from sqlalchemy import select

from app.features.pricing.models import TaxRate
from app.shared.base_repository import BaseRepository


class TaxRateRepository(BaseRepository[TaxRate]):
    model = TaxRate

    async def list_active_by_country(self, country: str) -> list[TaxRate]:
        result = await self.session.execute(
            select(TaxRate)
            .where(TaxRate.country == country.upper(), TaxRate.is_active.is_(True))
            .order_by(TaxRate.rate, TaxRate.name)
        )
        return list(result.scalars().all())
