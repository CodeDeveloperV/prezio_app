from app.features.catalog.models import Category, Product
from app.features.catalog.repository import CategoryRepository, ProductRepository


class CatalogService:
    def __init__(self, categories: CategoryRepository, products: ProductRepository) -> None:
        self.categories = categories
        self.products = products

    async def list_categories(self) -> list[Category]:
        return await self.categories.list_all()

    async def list_products(self) -> list[Product]:
        return await self.products.list_all()
