from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, EmailStr

from app.features.shopping_lists.enums import (
    ShoppingListInvitationStatus,
    ShoppingListMemberRole,
    ShoppingListStatus,
)
from app.features.comparison.enums import ProductComparisonStatus
from app.features.pricing.enums import Availability
from app.shared.base_schemas import ORMModel


class ShoppingListCreate(BaseModel):
    name: str
    client_request_id: str | None = None


class ShoppingListRead(ORMModel):
    id: int
    owner_user_id: int
    name: str
    status: ShoppingListStatus
    created_at: datetime
    active_store_branch_id: int | None


class ShoppingListActiveBranchUpdate(BaseModel):
    """Sets or clears (via null) the list's active_store_branch_id -- see
    ShoppingListService.set_active_branch."""

    store_branch_id: int | None


class ShoppingListItemCreate(BaseModel):
    product_id: int
    quantity: int = 1
    client_request_id: str | None = None


class ShoppingListItemUpdate(BaseModel):
    version: int
    quantity: int | None = None
    checked: bool | None = None


class ShoppingListItemRead(ORMModel):
    id: int
    shopping_list_id: int
    product_id: int
    quantity: int
    checked: bool
    added_by: int
    version: int
    checked_at: datetime | None
    price_at_check: Decimal | None
    store_branch_id: int | None


class ShoppingListSummaryPricingStatus(str, Enum):
    """Whether the summary's monetary figure covers every item in the active purchase."""

    COMPLETE = "complete"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"


class ShoppingListSummaryItem(BaseModel):
    shopping_list_item_id: int
    product_id: int
    quantity: int
    version: int
    name: str
    brand: str | None
    presentation: str | None
    image_url: str | None
    store_product_id: int | None
    current_price: Decimal | None
    currency: str | None
    availability: Availability | None
    pricing_status: ProductComparisonStatus
    unit_price: Decimal | None
    subtotal: Decimal | None


class ShoppingListSummaryRead(BaseModel):
    shopping_list_id: int
    active_store_branch_id: int | None
    store_name: str | None
    branch_name: str | None
    distinct_products_count: int
    total_units_count: int
    priced_subtotal: Decimal | None
    currency: str | None
    unpriced_items_count: int
    pricing_status: ShoppingListSummaryPricingStatus
    items: list[ShoppingListSummaryItem]


class ShoppingListMemberRead(ORMModel):
    id: int
    shopping_list_id: int
    user_id: int
    role: ShoppingListMemberRole
    joined_at: datetime


class ShoppingListInvitationCreate(BaseModel):
    invited_email: EmailStr


class ShoppingListInvitationRead(ORMModel):
    id: int
    shopping_list_id: int
    invited_email: str
    invited_user_id: int | None
    invited_by_user_id: int
    status: ShoppingListInvitationStatus
    created_at: datetime
    responded_at: datetime | None
