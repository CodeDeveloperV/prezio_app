from sqlalchemy import or_, select

from app.features.catalog.models import Brand, Category, Product, ProductAlias, ProductBarcode
from app.shared.base_repository import BaseRepository
from app.shared.enums import ModerationStatus

CANDIDATE_POOL_LIMIT = 50


class CategoryRepository(BaseRepository[Category]):
    model = Category


class BrandRepository(BaseRepository[Brand]):
    model = Brand

    async def get_by_name(self, name: str) -> Brand | None:
        result = await self.session.execute(select(Brand).where(Brand.name == name))
        return result.scalar_one_or_none()

    async def get_or_create_by_name(self, name: str) -> Brand:
        existing = await self.get_by_name(name)
        if existing is not None:
            return existing
        return await self.add(Brand(name=name))


class ProductRepository(BaseRepository[Product]):
    model = Product

    async def find_candidate_pool(
        self, *, brand_id: int | None, category_id: int | None, name_hint: str | None
    ) -> list[Product]:
        """A broad, cheap-to-fetch pool of plausible matches for the caller to score/rank.

        Prefers matching on brand/category (precise filters); falls back to a name-or-alias
        substring scan when neither is given, so a product found only through one of its
        `ProductAlias` rows is still a candidate. Early-stage catalog size makes a bounded
        scan-then-score acceptable -- a dedicated fuzzy-search index (e.g. pg_trgm) is the
        natural upgrade path if the catalog grows large.
        """
        stmt = select(Product).where(Product.status != ModerationStatus.MERGED)

        if brand_id is not None or category_id is not None:
            conditions = []
            if brand_id is not None:
                conditions.append(Product.brand_id == brand_id)
            if category_id is not None:
                conditions.append(Product.category_id == category_id)
            stmt = stmt.where(or_(*conditions))
        elif name_hint:
            pattern = f"%{name_hint.strip()}%"
            stmt = stmt.outerjoin(ProductAlias, ProductAlias.product_id == Product.id).where(
                or_(Product.canonical_name.ilike(pattern), ProductAlias.alias.ilike(pattern))
            )
        else:
            return []

        stmt = stmt.distinct().limit(CANDIDATE_POOL_LIMIT)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_status(self, status: ModerationStatus) -> list[Product]:
        result = await self.session.execute(select(Product).where(Product.status == status))
        return list(result.scalars().all())


class ProductBarcodeRepository(BaseRepository[ProductBarcode]):
    model = ProductBarcode

    async def find_matches_for_lookup(self, barcode: str, store_id: int) -> list[ProductBarcode]:
        """All rows that could resolve a scanned barcode in this store's context: rows scoped
        to this specific store plus store-agnostic (`store_id IS NULL`) rows, store-specific
        first -- a store-specific registration should override a generic label for the same
        barcode string.

        Returns every matching row rather than picking one so the caller (see
        `CatalogResolutionEngine`) can detect a CONFLICT: Postgres' unique constraint on
        (barcode, store_id) does not dedupe multiple `store_id IS NULL` rows, so the same
        barcode can legitimately -- or erroneously -- point at more than one Product globally.

        Excludes REJECTED rows: a barcode reported as "producto incorrecto" must fall through
        to the disambiguation flow again instead of resolving to the wrong product forever.
        """
        result = await self.session.execute(
            select(ProductBarcode)
            .where(
                ProductBarcode.barcode == barcode,
                ProductBarcode.status != ModerationStatus.REJECTED,
                or_(ProductBarcode.store_id == store_id, ProductBarcode.store_id.is_(None)),
            )
            .order_by(ProductBarcode.store_id.is_(None))
        )
        return list(result.scalars().all())

    async def list_by_status(self, status: ModerationStatus) -> list[ProductBarcode]:
        result = await self.session.execute(select(ProductBarcode).where(ProductBarcode.status == status))
        return list(result.scalars().all())

    async def list_by_product(self, product_id: int) -> list[ProductBarcode]:
        result = await self.session.execute(select(ProductBarcode).where(ProductBarcode.product_id == product_id))
        return list(result.scalars().all())

    async def find_conflict(self, product_id: int, barcode: str, store_id: int | None) -> ProductBarcode | None:
        """Is `barcode` already registered on `product_id` for this store? Used both to reject
        duplicate attach requests and to decide, during a merge, whether a source barcode can be
        moved onto the target as-is or must be discarded as truly redundant."""
        result = await self.session.execute(
            select(ProductBarcode).where(
                ProductBarcode.product_id == product_id,
                ProductBarcode.barcode == barcode,
                ProductBarcode.store_id == store_id,
            )
        )
        return result.scalar_one_or_none()


class ProductAliasRepository(BaseRepository[ProductAlias]):
    model = ProductAlias

    async def list_by_status(self, status: ModerationStatus) -> list[ProductAlias]:
        result = await self.session.execute(select(ProductAlias).where(ProductAlias.status == status))
        return list(result.scalars().all())

    async def list_by_product(self, product_id: int) -> list[ProductAlias]:
        result = await self.session.execute(select(ProductAlias).where(ProductAlias.product_id == product_id))
        return list(result.scalars().all())

    async def find_conflict(self, product_id: int, alias: str, language: str) -> ProductAlias | None:
        result = await self.session.execute(
            select(ProductAlias).where(
                ProductAlias.product_id == product_id,
                ProductAlias.alias == alias,
                ProductAlias.language == language,
            )
        )
        return result.scalar_one_or_none()
