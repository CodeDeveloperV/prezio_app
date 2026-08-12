from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class PriceAlertCreateRequest(BaseModel):
    product_id: int
    target_price: Decimal
    store_id: int | None = None
    store_branch_id: int | None = None


class PriceAlertUpdateRequest(BaseModel):
    target_price: Decimal | None = None
    active: bool | None = None


class PriceAlertRead(BaseModel):
    """Not an ORMModel: `product_name` doesn't live on PriceAlert itself -- the service batch
    -fetches Product rows and builds this schema explicitly (see PriceAlertService.list_for_user),
    the same pattern ComparisonService uses for cross-feature display data."""

    id: int
    user_id: int
    product_id: int
    product_name: str
    store_id: int | None
    store_branch_id: int | None
    target_price: Decimal
    active: bool
    is_below_threshold: bool
    last_triggered_at: datetime | None
    created_at: datetime
    updated_at: datetime
