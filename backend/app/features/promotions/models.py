from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.promotions.enums import PromotionStatus, PromotionType
from app.shared.models_base import Base


class Promotion(Base):
    """A temporary commercial benefit layered on top of a product's base price -- never
    mutates `StoreProduct.current_price` or writes `PriceHistory` (Promotions is a domain
    separate from Pricing; see EPIC 10 Fase 10.9 spec).

    `status` is the persisted lifecycle (DRAFT/PUBLISHED/CANCELLED); the full conceptual
    lifecycle (adding SCHEDULED/ACTIVE/EXPIRED) is derived from `start_at`/`end_at` at read
    time -- see `promotions.resolver.derive_display_status`.
    """

    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    type: Mapped[PromotionType] = mapped_column(Enum(PromotionType, native_enum=False))
    status: Mapped[PromotionStatus] = mapped_column(
        Enum(PromotionStatus, native_enum=False), default=PromotionStatus.DRAFT
    )
    # Resolves which promotion applies when more than one covers the same product/branch at
    # the same time -- promotions are allowed to overlap but never auto-stack (lower wins;
    # see `promotions.resolver.select_effective_promotion`).
    priority: Mapped[int] = mapped_column(Integer)

    percentage_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    fixed_discount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    special_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    buy_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pay_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

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

    branches: Mapped[list["PromotionBranch"]] = relationship(
        back_populates="promotion", cascade="all, delete-orphan"
    )
    products: Mapped[list["PromotionProduct"]] = relationship(
        back_populates="promotion", cascade="all, delete-orphan"
    )


class PromotionBranch(Base):
    __tablename__ = "promotion_branches"
    __table_args__ = (UniqueConstraint("promotion_id", "store_branch_id", name="uq_promotion_branches"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    promotion_id: Mapped[int] = mapped_column(ForeignKey("promotions.id", ondelete="CASCADE"), index=True)
    store_branch_id: Mapped[int] = mapped_column(ForeignKey("store_branches.id"), index=True)

    promotion: Mapped["Promotion"] = relationship(back_populates="branches")


class PromotionProduct(Base):
    __tablename__ = "promotion_products"
    __table_args__ = (UniqueConstraint("promotion_id", "product_id", name="uq_promotion_products"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    promotion_id: Mapped[int] = mapped_column(ForeignKey("promotions.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)

    promotion: Mapped["Promotion"] = relationship(back_populates="products")
