from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.pricing.enums import Availability, PriceUpdateSource, StoreProductStatus
from app.shared.models_base import Base


class TaxRate(Base):
    """A sale tax rate that applies within one country.

    Rates are data rather than an enum so jurisdictions can add, retire, or revise taxes
    without a deploy. A missing rate on a StoreProduct means the listing is exempt/not taxed.
    """

    __tablename__ = "tax_rates"
    __table_args__ = (UniqueConstraint("country", "code", name="uq_tax_rates_country_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    country: Mapped[str] = mapped_column(String(2), index=True)
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))
    rate: Mapped[float] = mapped_column(Numeric(5, 4))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StoreProduct(Base):
    """How a Product is sold at a specific StoreBranch. `version` backs optimistic concurrency
    control on `current_price`; a branch can only list a given product once.
    """

    __tablename__ = "store_products"
    __table_args__ = (UniqueConstraint("store_branch_id", "product_id", name="uq_store_products_branch_product"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    store_branch_id: Mapped[int] = mapped_column(ForeignKey("store_branches.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    current_price: Mapped[float] = mapped_column(Numeric(10, 2))
    # Shelf prices are captured as displayed by the retailer. Tax is separate metadata because
    # an equivalent product can have a different tax treatment in another country.
    tax_rate_id: Mapped[int | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    version: Mapped[int] = mapped_column(default=1)
    availability: Mapped[Availability] = mapped_column(Enum(Availability, native_enum=False), default=Availability.UNKNOWN)
    status: Mapped[StoreProductStatus] = mapped_column(
        Enum(StoreProductStatus, native_enum=False), default=StoreProductStatus.ACTIVE
    )
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    price_history: Mapped[list["PriceHistory"]] = relationship(back_populates="store_product")
    confirmations: Mapped[list["PriceConfirmation"]] = relationship(back_populates="store_product")
    tax_rate: Mapped["TaxRate | None"] = relationship()


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_product_id: Mapped[int] = mapped_column(ForeignKey("store_products.id"), index=True)
    previous_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    new_price: Mapped[float] = mapped_column(Numeric(10, 2))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    source: Mapped[PriceUpdateSource] = mapped_column(
        Enum(PriceUpdateSource, native_enum=False), default=PriceUpdateSource.COMMUNITY
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    store_product: Mapped["StoreProduct"] = relationship(back_populates="price_history")
    updated_by_user: Mapped["User | None"] = relationship(foreign_keys=[updated_by])  # noqa: F821


class PriceConfirmation(Base):
    """A single "✓ Coincide" event: records who confirmed a StoreProduct's price, at which
    branch, when, and at what price -- the raw ledger the reputation system counts from."""

    __tablename__ = "price_confirmations"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_product_id: Mapped[int] = mapped_column(ForeignKey("store_products.id"), index=True)
    store_branch_id: Mapped[int] = mapped_column(ForeignKey("store_branches.id"), index=True)
    confirmed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    confirmed_price: Mapped[float] = mapped_column(Numeric(10, 2))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    store_product: Mapped["StoreProduct"] = relationship(back_populates="confirmations")
