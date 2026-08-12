from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.features.pricing.enums import Availability
from app.shared.base_schemas import ORMModel


class StoreProductRead(ORMModel):
    id: int
    store_branch_id: int
    product_id: int
    current_price: Decimal
    currency: str
    version: int
    availability: Availability
    last_verified_at: datetime | None
    last_verified_by: int | None


class PriceHistoryRead(ORMModel):
    id: int
    store_product_id: int
    previous_price: Decimal | None
    new_price: Decimal
    updated_by: int | None
    updated_at: datetime


class PriceUpdateRequest(BaseModel):
    price: Decimal
    version: int


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
