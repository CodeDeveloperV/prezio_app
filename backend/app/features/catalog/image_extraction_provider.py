"""Seam for a future AI-assisted product field extraction step.

Scope: when a user adds a brand-new product (no barcode match, see
`CatalogResolutionEngine.create_new_product`) they will eventually be able to upload a photo and
have an AI provider suggest `canonical_name` / `brand_name` / `presentation` / `category_name` for
them to review and confirm before submitting `CreateProductRequest`. This is a distinct concern
from `recognition_provider.py` (matching a photo against *existing* Products) and from
`matching.ImageSimilarityScorer` (scoring visual similarity between two already-known images):
this seam extracts *new* structured attributes from a photo of a product nobody has catalogued
yet.

No implementation exists yet -- nothing in the catalog feature calls a provider today. This only
reserves the shape a vision/OCR/multimodal-LLM provider would plug into, so the confirmation flow
("el usuario solo confirma") has a stable contract to code against ahead of any real integration.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ProductImageExtractionInput:
    """Signal available today: the already-uploaded product photo. `store_id` is optional context
    a provider may use to bias extraction (e.g. a store's usual product mix) but never identifies
    the product on its own.
    """

    image_url: str
    store_id: int | None = None


@dataclass
class ExtractedField:
    """One suggested attribute plus the provider's own confidence in it -- lets the confirmation
    screen flag low-confidence fields for extra scrutiny instead of treating the whole suggestion
    as one all-or-nothing block.
    """

    value: str
    confidence: float


@dataclass
class ProductImageExtractionResult:
    """Everything extracted from one photo. Every field is optional and independently
    confidence-scored: a provider may confidently read the brand off a logo but fail to infer a
    category, and the confirmation screen must be able to show that partial result rather than
    discard it.
    """

    canonical_name: ExtractedField | None = None
    brand_name: ExtractedField | None = None
    presentation: ExtractedField | None = None
    category_name: ExtractedField | None = None
    provider: str = "none"


class ProductImageExtractionProvider(Protocol):
    """Implemented by a concrete vision/OCR/multimodal-LLM adapter (e.g. a cloud vision API or a
    multimodal-LLM wrapper). Never persists or decides anything -- it only proposes field values;
    `ModerationStatus.PENDING` + human confirmation is still mandatory for every product it
    touches, the same as a manually-entered one.
    """

    async def extract(self, input: ProductImageExtractionInput) -> ProductImageExtractionResult: ...


class NullProductImageExtractionProvider:
    """Default provider while no real integration is configured. Returns an empty result instead
    of raising, so a caller can treat "AI declined to suggest anything" and "AI not configured
    yet" identically -- the confirmation screen already has to handle a provider suggesting
    nothing.
    """

    async def extract(self, input: ProductImageExtractionInput) -> ProductImageExtractionResult:
        return ProductImageExtractionResult()
