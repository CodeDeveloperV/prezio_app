"""Seam for a future AI-assisted recognition step.

No implementation exists yet -- `CatalogResolutionEngine` never calls a provider today. This
only reserves the shape that an image/OCR/barcode-based recognizer would plug into once one
exists, so wiring it in later doesn't require reshaping the engine's candidate pipeline.
"""

from dataclasses import dataclass, field
from typing import Protocol

from app.features.catalog.models import Product


@dataclass
class RecognitionInput:
    barcode: str | None = None
    image_url: str | None = None
    ocr_text: str | None = None
    name_hint: str | None = None


@dataclass
class RecognitionCandidate:
    product: Product
    confidence: float
    matched_on: list[str] = field(default_factory=list)


class ProductRecognitionProvider(Protocol):
    """Analyzes whatever signals are available for a scan (image, OCR text, barcode, textual
    hints) and returns ranked candidate Products. Implementations are expected to be additive
    to -- not a replacement for -- `ProductMatchingService`'s deterministic scoring.
    """

    async def recognize(self, input: RecognitionInput) -> list[RecognitionCandidate]: ...
