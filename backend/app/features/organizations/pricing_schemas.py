from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, model_validator

from app.features.pricing.enums import Availability, PriceUpdateSource, StoreProductStatus
from app.features.pricing.schemas import PriceHistoryUpdatedByRead

# The B2B portal never exposes DISCONTINUED as an availability choice -- that would blur it
# with `listing_status=INACTIVE` (Fase 10.5's concern), which is exactly what Fase 10.6's spec
# says not to do. DISCONTINUED remains a valid `Availability` value for the community/mobile
# flow; it's just not selectable from this portal.
PORTAL_AVAILABILITY_CHOICES = (Availability.IN_STOCK, Availability.OUT_OF_STOCK, Availability.UNKNOWN)


class PricingListItemRead(BaseModel):
    store_product_id: int
    branch_id: int
    branch_name: str
    product_id: int
    canonical_name: str
    brand_name: str | None
    presentation: str | None
    category_name: str | None
    barcode: str | None
    image_url: str | None
    current_price: Decimal
    previous_price: Decimal | None
    currency: str
    availability: Availability
    listing_status: StoreProductStatus
    version: int
    last_verified_at: datetime | None
    updated_at: datetime
    last_updated_by: PriceHistoryUpdatedByRead | None
    last_update_source: PriceUpdateSource | None


class B2BPriceUpdateRequest(BaseModel):
    price: Decimal | None = None
    availability: Availability | None = None
    version: int

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "B2BPriceUpdateRequest":
        if self.price is None and self.availability is None:
            raise ValueError("At least one of price or availability must be provided")
        return self

    @model_validator(mode="after")
    def _availability_within_portal_choices(self) -> "B2BPriceUpdateRequest":
        if self.availability is not None and self.availability not in PORTAL_AVAILABILITY_CHOICES:
            raise ValueError(f"availability must be one of {[a.value for a in PORTAL_AVAILABILITY_CHOICES]}")
        return self


class B2BPriceConflictRead(BaseModel):
    detail: str = "This listing was updated concurrently by someone else"
    store_product_id: int
    submitted_price: Decimal | None
    submitted_availability: Availability | None
    submitted_version: int
    current_price: Decimal
    current_availability: Availability | None
    current_version: int


class B2BBatchUpdateItem(BaseModel):
    store_product_id: int
    price: Decimal | None = None
    availability: Availability | None = None
    version: int

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "B2BBatchUpdateItem":
        if self.price is None and self.availability is None:
            raise ValueError("At least one of price or availability must be provided")
        return self

    @model_validator(mode="after")
    def _availability_within_portal_choices(self) -> "B2BBatchUpdateItem":
        if self.availability is not None and self.availability not in PORTAL_AVAILABILITY_CHOICES:
            raise ValueError(f"availability must be one of {[a.value for a in PORTAL_AVAILABILITY_CHOICES]}")
        return self


class B2BBatchUpdateRequest(BaseModel):
    items: list[B2BBatchUpdateItem]

    @model_validator(mode="after")
    def _non_empty(self) -> "B2BBatchUpdateRequest":
        if not self.items:
            raise ValueError("items must not be empty")
        return self


class B2BBatchFailedItem(BaseModel):
    store_product_id: int
    error: str


class B2BBatchUpdateResponse(BaseModel):
    updated: list[PricingListItemRead]
    conflicts: list[B2BPriceConflictRead]
    failed: list[B2BBatchFailedItem]
