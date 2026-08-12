from sqlalchemy import select

from app.features.moderation.models import ProductMerge
from app.shared.base_repository import BaseRepository
from app.shared.enums import ModerationStatus


class ProductMergeRepository(BaseRepository[ProductMerge]):
    model = ProductMerge

    async def list_by_status(self, status: ModerationStatus) -> list[ProductMerge]:
        result = await self.session.execute(select(ProductMerge).where(ProductMerge.status == status))
        return list(result.scalars().all())

    async def find_pending_for_pair(self, source_product_id: int, target_product_id: int) -> ProductMerge | None:
        result = await self.session.execute(
            select(ProductMerge).where(
                ProductMerge.source_product_id == source_product_id,
                ProductMerge.target_product_id == target_product_id,
                ProductMerge.status == ModerationStatus.PENDING,
            )
        )
        return result.scalar_one_or_none()
