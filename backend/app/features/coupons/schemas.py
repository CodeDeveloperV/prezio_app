from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator, model_validator

from app.features.coupons.enums import CouponDisplayStatus, CouponStatus, CouponType

_REQUIRED_VALUE_FIELDS_BY_TYPE = {
    CouponType.PERCENTAGE_DISCOUNT: {"percentage_value"},
    CouponType.FIXED_AMOUNT: {"fixed_amount_value"},
}


def _validate_coupon_type_values(
    coupon_type: CouponType,
    percentage_value: Decimal | None,
    fixed_amount_value: Decimal | None,
    maximum_discount_amount: Decimal | None,
) -> None:
    """Only the value field matching `coupon_type` may be set, and it must satisfy its own
    range rule (EPIC 10 Fase 10.10 spec). `maximum_discount_amount` only makes sense as a cap
    on a percentage discount -- a fixed-amount coupon's discount is already a known number, so
    it may not be combined with a max cap."""
    all_fields = {"percentage_value": percentage_value, "fixed_amount_value": fixed_amount_value}
    required = _REQUIRED_VALUE_FIELDS_BY_TYPE[coupon_type]
    for field_name, value in all_fields.items():
        if field_name in required and value is None:
            raise ValueError(f"{field_name} is required for {coupon_type.value}")
        if field_name not in required and value is not None:
            raise ValueError(f"{field_name} must not be set for {coupon_type.value}")

    if coupon_type == CouponType.PERCENTAGE_DISCOUNT:
        assert percentage_value is not None
        if not (Decimal("0") < percentage_value <= Decimal("100")):
            raise ValueError("percentage_value must be greater than 0 and at most 100")
    elif coupon_type == CouponType.FIXED_AMOUNT:
        assert fixed_amount_value is not None
        if fixed_amount_value <= 0:
            raise ValueError("fixed_amount_value must be greater than 0")
        if maximum_discount_amount is not None:
            raise ValueError("maximum_discount_amount must not be set for fixed_amount")

    if maximum_discount_amount is not None and maximum_discount_amount < 0:
        raise ValueError("maximum_discount_amount must be zero or greater")


class _CouponValueFields(BaseModel):
    name: str
    description: str | None = None
    code: str
    type: CouponType
    percentage_value: Decimal | None = None
    fixed_amount_value: Decimal | None = None
    applies_to_entire_purchase: bool = True
    applies_to_all_branches: bool = True
    minimum_purchase_amount: Decimal | None = None
    maximum_discount_amount: Decimal | None = None
    max_redemptions_total: int | None = None
    max_redemptions_per_user: int | None = None
    is_stackable: bool = False
    start_at: datetime
    end_at: datetime
    branch_ids: list[int] = []
    product_ids: list[int] = []

    @field_validator("code")
    @classmethod
    def _code_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("code must not be blank")
        return value

    @model_validator(mode="after")
    def _dates_ordered(self) -> "_CouponValueFields":
        if self.start_at >= self.end_at:
            raise ValueError("start_at must be before end_at")
        return self

    @model_validator(mode="after")
    def _type_values_valid(self) -> "_CouponValueFields":
        _validate_coupon_type_values(
            self.type, self.percentage_value, self.fixed_amount_value, self.maximum_discount_amount
        )
        return self

    @model_validator(mode="after")
    def _limits_valid(self) -> "_CouponValueFields":
        if self.minimum_purchase_amount is not None and self.minimum_purchase_amount < 0:
            raise ValueError("minimum_purchase_amount must be zero or greater")
        if self.max_redemptions_total is not None and self.max_redemptions_total <= 0:
            raise ValueError("max_redemptions_total must be greater than 0 when set")
        if self.max_redemptions_per_user is not None and self.max_redemptions_per_user <= 0:
            raise ValueError("max_redemptions_per_user must be greater than 0 when set")
        return self


class CouponCreate(_CouponValueFields):
    pass


class CouponUpdate(_CouponValueFields):
    """A full-replace shape, same as `CouponCreate` -- PATCH is only ever allowed on a DRAFT
    coupon (see `CouponNotEditable`), so there's no partial-update ambiguity to support."""

    pass


class CouponRead(BaseModel):
    id: int
    store_id: int
    name: str
    description: str | None
    code: str
    type: CouponType
    status: CouponStatus
    display_status: CouponDisplayStatus
    percentage_value: Decimal | None
    fixed_amount_value: Decimal | None
    applies_to_entire_purchase: bool
    applies_to_all_branches: bool
    minimum_purchase_amount: Decimal | None
    maximum_discount_amount: Decimal | None
    max_redemptions_total: int | None
    max_redemptions_per_user: int | None
    is_stackable: bool
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


class CouponListItemRead(BaseModel):
    id: int
    name: str
    code: str
    type: CouponType
    status: CouponStatus
    display_status: CouponDisplayStatus
    percentage_value: Decimal | None
    fixed_amount_value: Decimal | None
    applies_to_entire_purchase: bool
    applies_to_all_branches: bool
    max_redemptions_total: int | None
    max_redemptions_per_user: int | None
    start_at: datetime
    end_at: datetime
    branch_ids: list[int]
    product_ids: list[int]
    created_by: int | None


class CouponListRead(BaseModel):
    items: list[CouponListItemRead]
    total: int
    page: int
    page_size: int
