import enum
from decimal import Decimal

from pydantic import BaseModel

from app.features.catalog.enums import RecognitionType
from app.features.pricing.enums import StoreProductStatus
from app.shared.enums import ModerationStatus


class OrgListingStatus(str, enum.Enum):
    """Tri-state, response-only view of a branch's relationship to a Product: whether a
    `StoreProduct` row exists for this org's branch and, if so, its `StoreProductStatus`."""

    NOT_LISTED = "not_listed"
    ACTIVE = "active"
    INACTIVE = "inactive"


class CatalogProductSummary(BaseModel):
    id: int
    canonical_name: str
    brand_name: str | None
    presentation: str | None
    category_name: str | None
    barcode: str | None
    image_url: str | None
    status: ModerationStatus
    recognition_type: RecognitionType
    branches_listed_count: int
    org_status: OrgListingStatus


class BranchListingRead(BaseModel):
    branch_id: int
    branch_name: str
    city: str
    status: OrgListingStatus
    store_product_id: int | None
    current_price: Decimal | None
    currency: str | None


class CatalogProductDetail(BaseModel):
    id: int
    canonical_name: str
    brand_name: str | None
    presentation: str | None
    category_name: str | None
    barcode: str | None
    description: str | None
    image_url: str | None
    status: ModerationStatus
    recognition_type: RecognitionType
    branches: list[BranchListingRead]


class CreateListingRequest(BaseModel):
    branch_ids: list[int]
    initial_price: Decimal
    currency: str = "USD"


class UpdateListingStatusRequest(BaseModel):
    status: StoreProductStatus
