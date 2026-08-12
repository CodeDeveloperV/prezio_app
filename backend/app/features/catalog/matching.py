"""Candidate scoring for the "barcode not found" recognition flow.

Kept separate from ProductRecognitionService so the scoring strategy (today: name
similarity + exact-field matches) can be swapped out -- e.g. for an embedding-based
image comparator -- without touching the orchestration logic in the service.
"""

import difflib
from dataclasses import dataclass, field
from typing import Protocol

from app.features.catalog.models import Product
from app.features.catalog.normalization import normalize_name, presentations_match

NAME_WEIGHT = 0.45
BRAND_WEIGHT = 0.2
PRESENTATION_WEIGHT = 0.15
CATEGORY_WEIGHT = 0.1
IMAGE_WEIGHT = 0.1

# Below this combined score a candidate is considered noise and withheld from the
# "which of these is it?" prompt shown to the user.
MIN_CANDIDATE_SCORE = 0.45
MAX_CANDIDATES = 5


class ImageSimilarityScorer(Protocol):
    """Seam for a future image-embedding comparator. `score` returns a 0..1 visual
    similarity between the scanned photo and a candidate product's reference image.
    """

    async def score(self, image_url: str, candidate: Product) -> float: ...


class NullImageSimilarityScorer:
    """Default scorer: no image model exists yet, so image similarity never contributes."""

    async def score(self, image_url: str, candidate: Product) -> float:
        return 0.0


@dataclass
class ScoredCandidate:
    product: Product
    score: float
    matched_on: list[str] = field(default_factory=list)


def _name_similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


async def score_candidate(
    product: Product,
    *,
    name_hint: str | None,
    brand_id: int | None,
    presentation: str | None,
    category_id: int | None,
    image_url: str | None,
    image_scorer: ImageSimilarityScorer,
) -> ScoredCandidate:
    score = 0.0
    matched_on: list[str] = []

    if name_hint and product.canonical_name:
        similarity = _name_similarity(product.canonical_name, name_hint)
        score += similarity * NAME_WEIGHT
        if similarity >= 0.6:
            matched_on.append("name")

    if brand_id is not None and product.brand_id == brand_id:
        score += BRAND_WEIGHT
        matched_on.append("brand")

    if presentations_match(presentation, product.presentation):
        score += PRESENTATION_WEIGHT
        matched_on.append("presentation")

    if category_id is not None and product.category_id == category_id:
        score += CATEGORY_WEIGHT
        matched_on.append("category")

    if image_url and product.image_url:
        image_similarity = await image_scorer.score(image_url, product)
        score += image_similarity * IMAGE_WEIGHT
        if image_similarity >= 0.6:
            matched_on.append("image")

    return ScoredCandidate(product=product, score=score, matched_on=matched_on)


async def rank_candidates(
    pool: list[Product],
    *,
    name_hint: str | None,
    brand_id: int | None,
    presentation: str | None,
    category_id: int | None,
    image_url: str | None,
    image_scorer: ImageSimilarityScorer,
) -> list[ScoredCandidate]:
    scored = [
        await score_candidate(
            product,
            name_hint=name_hint,
            brand_id=brand_id,
            presentation=presentation,
            category_id=category_id,
            image_url=image_url,
            image_scorer=image_scorer,
        )
        for product in pool
    ]
    scored = [c for c in scored if c.score >= MIN_CANDIDATE_SCORE]
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:MAX_CANDIDATES]
