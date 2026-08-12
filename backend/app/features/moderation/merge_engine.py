from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.models import Product
from app.features.catalog.repository import ProductAliasRepository, ProductBarcodeRepository
from app.features.pricing.models import PriceHistory
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.shared.enums import ModerationStatus


async def execute_product_merge(
    db: AsyncSession,
    *,
    source: Product,
    target: Product,
    barcodes: ProductBarcodeRepository,
    aliases: ProductAliasRepository,
    store_products: StoreProductRepository,
    price_history: PriceHistoryRepository,
    price_confirmations: PriceConfirmationRepository,
    moderator_id: int,
) -> None:
    """Migrates every barcode, alias, price and price-history row from `source` onto `target`,
    then marks `source` as MERGED.

    Nothing is ever silently discarded: a source row is only dropped when an identical row
    already exists on the target (truly redundant), and a source StoreProduct's price history is
    always fully re-parented onto the target's StoreProduct for that branch -- even when that
    means inserting one synthetic snapshot row to preserve a price that had no recorded history.
    """
    for barcode in await barcodes.list_by_product(source.id):
        conflict = await barcodes.find_conflict(target.id, barcode.barcode, barcode.store_id)
        if conflict is not None:
            await barcodes.delete(barcode)
        else:
            barcode.product_id = target.id

    for alias in await aliases.list_by_product(source.id):
        conflict = await aliases.find_conflict(target.id, alias.alias, alias.language)
        if conflict is not None:
            await aliases.delete(alias)
        else:
            alias.product_id = target.id

    for source_sp in await store_products.list_by_product(source.id):
        target_sp = await store_products.get_by_branch_and_product(source_sp.store_branch_id, target.id)
        if target_sp is None:
            source_sp.product_id = target.id
            continue

        moved = await price_history.reassign_store_product(source_sp.id, target_sp.id)
        if moved == 0:
            await price_history.add(
                PriceHistory(
                    store_product_id=target_sp.id,
                    previous_price=None,
                    new_price=source_sp.current_price,
                    updated_by=moderator_id,
                )
            )
        await price_confirmations.reassign_store_product(source_sp.id, target_sp.id)
        await store_products.delete(source_sp)

    source.status = ModerationStatus.MERGED
    await db.flush()
