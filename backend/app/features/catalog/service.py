from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.models import Category, Product
from app.features.catalog.repository import CategoryRepository, ProductRepository
from app.shared.enums import ModerationStatus


class CatalogService:
    def __init__(self, categories: CategoryRepository, products: ProductRepository) -> None:
        self.categories = categories
        self.products = products

    async def list_categories(self) -> list[Category]:
        return await self.categories.list_all()

    async def list_products(self) -> list[Product]:
        return await self.products.list_all()

    async def search_products(
        self,
        *,
        name: str | None = None,
        barcode: str | None = None,
        brand_id: int | None = None,
        category_id: int | None = None,
        status: ModerationStatus | None = None,
    ) -> list[Product]:
        return await self.products.search(
            name=name, barcode=barcode, brand_id=brand_id, category_id=category_id, status=status
        )

    async def get_product(self, product_id: int) -> Product:
        product = await self.products.get_with_relations(product_id)
        if product is None:
            raise ProductNotFound(product_id)
        return product
