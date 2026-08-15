from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, model_validator

from app.features.promotions.enums import PromotionDisplayStatus, PromotionStatus, PromotionType

_REQUIRED_VALUE_FIELDS_BY_TYPE = {
    PromotionType.PERCENTAGE_DISCOUNT: {"percentage_value"},
    PromotionType.FIXED_DISCOUNT: {"fixed_discount_value"},
    PromotionType.SPECIAL_PRICE: {"special_price"},
    PromotionType.BUY_X_GET_Y: {"buy_quantity", "pay_quantity"},
}


def _validate_promotion_type_values(
    promotion_type: PromotionType,
    percentage_value: Decimal | None,
    fixed_discount_value: Decimal | None,
    special_price: Decimal | None,
    buy_quantity: int | None,
    pay_quantity: int | None,
) -> None:
    """Only the value field(s) matching `promotion_type` may be set, and the field(s) set for
    that type must satisfy its own range rule (EPIC 10 Fase 10.9 spec)."""
    all_fields = {
        "percentage_value": percentage_value,
        "fixed_discount_value": fixed_discount_value,
        "special_price": special_price,
        "buy_quantity": buy_quantity,
        "pay_quantity": pay_quantity,
    }
    required = _REQUIRED_VALUE_FIELDS_BY_TYPE[promotion_type]
    for field_name, value in all_fields.items():
        if field_name in required and value is None:
            raise ValueError(f"{field_name} is required for {promotion_type.value}")
        if field_name not in required and value is not None:
            raise ValueError(f"{field_name} must not be set for {promotion_type.value}")

    if promotion_type == PromotionType.PERCENTAGE_DISCOUNT:
        assert percentage_value is not None
        if not (Decimal("0") < percentage_value <= Decimal("100")):
            raise ValueError("percentage_value must be greater than 0 and at most 100")
    elif promotion_type == PromotionType.FIXED_DISCOUNT:
        assert fixed_discount_value is not None
        if fixed_discount_value <= 0:
            raise ValueError("fixed_discount_value must be greater than 0")
    elif promotion_type == PromotionType.SPECIAL_PRICE:
        assert special_price is not None
        if special_price < 0:
            raise ValueError("special_price must be zero or greater")
    elif promotion_type == PromotionType.BUY_X_GET_Y:
        assert buy_quantity is not None and pay_quantity is not None
        if pay_quantity < 1:
            raise ValueError("pay_quantity must be at least 1")
        if buy_quantity <= pay_quantity:
            raise ValueError("buy_quantity must be greater than pay_quantity")


class _PromotionValueFields(BaseModel):
    type: PromotionType
    percentage_value: Decimal | None = None
    fixed_discount_value: Decimal | None = None
    special_price: Decimal | None = None
    buy_quantity: int | None = None
    pay_quantity: int | None = None
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def _dates_ordered(self) -> "_PromotionValueFields":
        if self.start_at >= self.end_at:
            raise ValueError("start_at must be before end_at")
        return self

    @model_validator(mode="after")
    def _type_values_valid(self) -> "_PromotionValueFields":
        _validate_promotion_type_values(
            self.type,
            self.percentage_value,
            self.fixed_discount_value,
            self.special_price,
            self.buy_quantity,
            self.pay_quantity,
        )
        return self


class PromotionCreate(_PromotionValueFields):
    name: str
    description: str | None = None
    priority: int | None = None
    branch_ids: list[int] = []
    product_ids: list[int] = []


class PromotionUpdate(_PromotionValueFields):
    """A full-replace shape, same as `PromotionCreate` -- PATCH is only ever allowed on a
    DRAFT promotion (see `PromotionNotEditable`), so there's no partial-update ambiguity to
    support."""

    name: str
    description: str | None = None
    priority: int | None = None
    branch_ids: list[int] = []
    product_ids: list[int] = []


class PromotionRead(BaseModel):
    id: int
    store_id: int
    name: str
    description: str | None
    type: PromotionType
    status: PromotionStatus
    display_status: PromotionDisplayStatus
    priority: int
    percentage_value: Decimal | None
    fixed_discount_value: Decimal | None
    special_price: Decimal | None
    buy_quantity: int | None
    pay_quantity: int | None
    start_at: datetime
    end_at: datetime
    branch_ids: list[int]
    product_ids: list[int]
    created_by: int | None
    updated_by: int | None
    published_by: int | None
    published_at: datetime | None
    cancelled_by: int | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PromotionListItemRead(BaseModel):
    id: int
    name: str
    type: PromotionType
    status: PromotionStatus
    display_status: PromotionDisplayStatus
    priority: int
    start_at: datetime
    end_at: datetime
    branch_ids: list[int]
    product_ids: list[int]


class PromotionListRead(BaseModel):
    items: list[PromotionListItemRead]
    total: int
    page: int
    page_size: int


class EffectivePromotionRead(BaseModel):
    """Result of `PromotionService.get_effective_promotion` -- BUY_X_GET_Y carries quantity
    metadata instead of a fabricated single unit price."""

    promotion_id: int
    type: PromotionType
    effective_unit_price: Decimal | None
    buy_quantity: int | None
    pay_quantity: int | None
