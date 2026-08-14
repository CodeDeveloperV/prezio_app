from dataclasses import dataclass

from app.features.catalog.models import Category, Product
from app.features.catalog.repository import BrandRepository, CategoryRepository, ProductRepository
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository


@dataclass(slots=True)
class ProductSearchHit:
    product: Product
    brand_name: str | None
    store_product: StoreProduct | None


class CatalogService:
    def __init__(
        self,
        categories: CategoryRepository,
        products: ProductRepository,
        store_products: StoreProductRepository,
        brands: BrandRepository,
    ) -> None:
        self.categories = categories
        self.products = products
        self.store_products = store_products
        self.brands = brands

    async def list_categories(self) -> list[Category]:
        return await self.categories.list_all()

    async def list_products(self) -> list[Product]:
        return await self.products.list_all()

    async def search_products(self, query: str, store_branch_id: int | None = None) -> list[ProductSearchHit]:
        clean_query = query.strip()
        if len(clean_query) < 5:
            return []

        products = await self.products.search_by_query(clean_query)
        store_products_by_product_id: dict[int, StoreProduct] = {}
        brand_names_by_id: dict[int, str | None] = {}

        for product in products:
            brand_id = product.brand_id
            if brand_id is None or brand_id in brand_names_by_id:
                continue
            brand = await self.brands.get_by_id(brand_id)
            brand_names_by_id[brand_id] = brand.name if brand else None

        if store_branch_id is not None and products:
            store_products = await self.store_products.list_by_branches_and_products(
                [store_branch_id], [product.id for product in products]
            )
            store_products_by_product_id = {store_product.product_id: store_product for store_product in store_products}

        return [
            ProductSearchHit(
                product=product,
                brand_name=brand_names_by_id.get(product.brand_id),
                store_product=store_products_by_product_id.get(product.id),
            )
            for product in products
        ]
