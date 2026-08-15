from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.coupons.enums import CouponStatus, CouponType
from app.shared.models_base import Base


class Coupon(Base):
    """A code-conditioned benefit administered by an organization -- fully separate from
    `Promotion` (EPIC 10 Fase 10.10 spec): a Promotion is an automatic commercial benefit with
    no code; a Coupon requires the consumer to present/use a code. Never a Promotion with
    `requires_code=true`, never reuses the `promotions` table, no FK to `Promotion`.

    Fase 10.10 only covers the merchant side (define the coupon) -- eligibility, claim,
    redemption, per-user usage counters, and anti-fraud are EPIC 11's responsibility and are
    deliberately not modeled here yet (no `CouponRedemption` table).

    `status` is the persisted lifecycle (DRAFT/PUBLISHED/CANCELLED); the full conceptual
    lifecycle (adding SCHEDULED/ACTIVE/EXPIRED) is derived from `start_at`/`end_at` at read
    time -- see `coupons.resolver.derive_display_status`, same pattern as Promotion.
    """

    __tablename__ = "coupons"
    __table_args__ = (UniqueConstraint("store_id", "normalized_code", name="uq_coupons_store_normalized_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    code: Mapped[str] = mapped_column(String(50))
    # Uppercase+trimmed form of `code` -- uniqueness and lookup are always case-insensitive,
    # scoped per organization (not global): the same code may exist across different orgs.
    normalized_code: Mapped[str] = mapped_column(String(50), index=True)
    type: Mapped[CouponType] = mapped_column(Enum(CouponType, native_enum=False))
    status: Mapped[CouponStatus] = mapped_column(Enum(CouponStatus, native_enum=False), default=CouponStatus.DRAFT)

    percentage_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    fixed_amount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    applies_to_entire_purchase: Mapped[bool] = mapped_column(Boolean, default=True)
    applies_to_all_branches: Mapped[bool] = mapped_column(Boolean, default=True)

    minimum_purchase_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    maximum_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Persisted but not enforced/counted in Fase 10.10 -- null means unlimited. Actual usage
    # counting must derive from a future `CouponRedemption` table (EPIC 11), never from a
    # mutable counter column here.
    max_redemptions_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_redemptions_per_user: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Field only -- no stacking logic implemented yet; combining a Coupon with a Promotion or
    # another Coupon is an EPIC 11 decision.
    is_stackable: Mapped[bool] = mapped_column(Boolean, default=False)

    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    branches: Mapped[list["CouponBranch"]] = relationship(back_populates="coupon", cascade="all, delete-orphan")
    products: Mapped[list["CouponProduct"]] = relationship(back_populates="coupon", cascade="all, delete-orphan")


class CouponBranch(Base):
    __tablename__ = "coupon_branches"
    __table_args__ = (UniqueConstraint("coupon_id", "store_branch_id", name="uq_coupon_branches"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), index=True)
    store_branch_id: Mapped[int] = mapped_column(ForeignKey("store_branches.id"), index=True)

    coupon: Mapped["Coupon"] = relationship(back_populates="branches")


class CouponProduct(Base):
    __tablename__ = "coupon_products"
    __table_args__ = (UniqueConstraint("coupon_id", "product_id", name="uq_coupon_products"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)

    coupon: Mapped["Coupon"] = relationship(back_populates="products")
