"""Finds and ranks candidate Products for a scan that didn't resolve directly via barcode.

Owns the parts of matching that are about *finding and comparing* products (pool assembly via
canonical_name + ProductAlias, brand/presentation/category comparison via normalization);
delegates the actual scoring formula to `app.features.catalog.matching`, which is kept separate
so that strategy (today: name similarity + exact-field matches) can be swapped -- e.g. for an
embedding-based comparator -- without touching pool assembly.
"""

from app.features.catalog.matching import ImageSimilarityScorer, NullImageSimilarityScorer, ScoredCandidate, rank_candidates
from app.features.catalog.repository import ProductRepository


class ProductMatchingService:
    def __init__(self, products: ProductRepository, image_scorer: ImageSimilarityScorer | None = None) -> None:
        self.products = products
        self.image_scorer = image_scorer or NullImageSimilarityScorer()

    async def find_candidates(
        self,
        *,
        name_hint: str | None,
        brand_id: int | None,
        presentation: str | None,
        category_id: int | None,
        image_url: str | None,
    ) -> list[ScoredCandidate]:
        pool = await self.products.find_candidate_pool(
            brand_id=brand_id, category_id=category_id, name_hint=name_hint
        )
        return await rank_candidates(
            pool,
            name_hint=name_hint,
            brand_id=brand_id,
            presentation=presentation,
            category_id=category_id,
            image_url=image_url,
            image_scorer=self.image_scorer,
        )
