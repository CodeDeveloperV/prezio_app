from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.features.catalog.enums import BarcodeSource, BarcodeType, RecognitionType
from app.features.pricing.schemas import StoreProductRead
from app.shared.base_schemas import ORMModel
from app.shared.enums import ModerationStatus
from app.features.pricing.enums import Availability


class CategoryRead(ORMModel):
    id: int
    name: str
    parent_id: int | None


class BrandRead(ORMModel):
    id: int
    name: str


class ProductRead(ORMModel):
    id: int
    canonical_name: str
    brand_id: int | None
    category_id: int | None
    presentation: str | None
    description: str | None
    image_url: str | None
    recognition_type: RecognitionType
    status: ModerationStatus
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime


class ProductBarcodeRead(ORMModel):
    id: int
    product_id: int
    barcode: str
    barcode_type: BarcodeType
    store_id: int | None
    country: str | None
    source: BarcodeSource
    confidence: float
    status: ModerationStatus
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_by: int | None
    created_at: datetime


class ProductAliasRead(ORMModel):
    id: int
    product_id: int
    alias: str
    language: str
    confidence: float
    status: ModerationStatus
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_by: int | None
    created_at: datetime


# --- Barcode scan / recognition flow ----------------------------------------------


class ScanBarcodeRequest(BaseModel):
    barcode: str
    barcode_type: BarcodeType = BarcodeType.OTHER
    store_branch_id: int | None = None
    country: str | None = None
    # Hints used only to search for candidates when the barcode is unknown -- none of
    # these identify the product on their own, they only feed the matcher's scoring.
    name_hint: str | None = None
    brand_id: int | None = None
    category_id: int | None = None
    presentation: str | None = None
    image_url: str | None = None  # reserved for future image-similarity matching


class ScanProductDetails(BaseModel):
    """Just what the scan-result screen needs to render a match: image, brand, name,
    presentation -- price/updated_at come from the sibling `store_product`."""

    id: int
    canonical_name: str
    brand_name: str | None
    presentation: str | None
    image_url: str | None
    status: ModerationStatus


class ScanPriceOfferRead(BaseModel):
    store_product_id: int
    store_branch_id: int
    store_name: str
    store_branch_name: str
    current_price: Decimal
    currency: str
    availability: Availability
    last_verified_at: datetime | None


class CatalogSearchResultRead(BaseModel):
    product: ScanProductDetails
    store_product: StoreProductRead | None = None


class ScanFoundResult(BaseModel):
    status: Literal["found"] = "found"
    barcode_id: int  # lets the client call POST /catalog/barcodes/{barcode_id}/report ("Producto incorrecto")
    product: ScanProductDetails
    store_product: StoreProductRead | None
    price_offers: list[ScanPriceOfferRead] = Field(default_factory=list)


class ProductMatchCandidate(BaseModel):
    product: ProductRead
    score: float
    matched_on: list[str]


class ScanNeedsDisambiguationResult(BaseModel):
    status: Literal["needs_disambiguation"] = "needs_disambiguation"
    candidates: list[ProductMatchCandidate]


class ScanNotFoundResult(BaseModel):
    status: Literal["not_found"] = "not_found"


class ScanConflictResult(BaseModel):
    """The scanned barcode is registered (store-agnostically) to more than one Product --
    e.g. two independent "producto incorrecto" corrections that never converged. The engine
    never auto-picks one; this must be resolved manually/collaboratively (see moderation)."""

    status: Literal["conflict"] = "conflict"
    candidates: list[ProductRead]
    warnings: list[str]


ScanResult = Annotated[
    Union[ScanFoundResult, ScanNeedsDisambiguationResult, ScanNotFoundResult, ScanConflictResult],
    Field(discriminator="status"),
]


class AttachBarcodeRequest(BaseModel):
    """Attaches an already-scanned barcode to an existing Product the user picked from the
    disambiguation list -- never creates or mutates a Product."""

    barcode: str
    barcode_type: BarcodeType = BarcodeType.OTHER
    store_id: int | None = None
    country: str | None = None


class CreateProductRequest(BaseModel):
    """Fields collected when no candidate matched the scanned barcode. The resulting Product
    is created with status PENDING; the scanned barcode is attached automatically."""

    image_url: str
    canonical_name: str
    brand_id: int | None = None
    brand_name: str | None = None
    presentation: str | None = None
    category_id: int
    barcode: str
    barcode_type: BarcodeType = BarcodeType.OTHER
    store_id: int | None = None
    country: str | None = None
