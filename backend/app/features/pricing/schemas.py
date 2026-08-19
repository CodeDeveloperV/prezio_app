from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.features.pricing.enums import Availability, PriceUpdateSource
from app.shared.base_schemas import ORMModel


class StoreProductRead(ORMModel):
    id: int
    store_branch_id: int
    product_id: int
    current_price: Decimal
    tax_rate_id: int | None
    currency: str
    version: int
    availability: Availability
    last_verified_at: datetime | None
    last_verified_by: int | None


class TaxRateRead(ORMModel):
    id: int
    country: str
    code: str
    name: str
    rate: Decimal


class PriceHistoryUpdatedByRead(BaseModel):
    """Display-friendly identity of who made a price change; `user_id` is kept for
    traceability but the UI should show `display_name or email`, not the raw id."""

    user_id: int
    display_name: str | None
    email: str


class PriceHistoryRead(BaseModel):
    id: int
    store_product_id: int
    previous_price: Decimal | None
    new_price: Decimal
    updated_by: PriceHistoryUpdatedByRead | None
    source: PriceUpdateSource
    updated_at: datetime


class PriceUpdateRequest(BaseModel):
    price: Decimal
    version: int


class StoreProductCreate(BaseModel):
    product_id: int
    store_branch_id: int
    current_price: Decimal


class PriceConflictResponse(BaseModel):
    detail: str = "Price was updated concurrently by someone else"
    current_price: Decimal
    version: int


class PriceConfirmationRead(ORMModel):
    id: int
    store_product_id: int
    store_branch_id: int
    confirmed_by: int
    confirmed_price: Decimal
    confirmed_at: datetime


class UserReputationRead(BaseModel):
    user_id: int
    correct_confirmations: int
