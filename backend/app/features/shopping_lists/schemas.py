from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr

from app.features.shopping_lists.enums import (
    ShoppingListInvitationStatus,
    ShoppingListMemberRole,
    ShoppingListStatus,
)
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
