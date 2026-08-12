from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.catalog.enums import BarcodeSource, BarcodeType, RecognitionType
from app.shared.enums import ModerationStatus
from app.shared.models_base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    products: Mapped[list["Product"]] = relationship(back_populates="brand")


class Product(Base):
    """The canonical identity of a product. Deliberately holds no barcode or price: a barcode
    is one of possibly several labels that resolve to this identity (see ProductBarcode) and a
    price is store-specific (see StoreProduct in the pricing feature) -- neither uniquely
    identifies the product itself.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(255), index=True)
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    presentation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    recognition_type: Mapped[RecognitionType] = mapped_column(
        Enum(RecognitionType, native_enum=False), default=RecognitionType.MANUAL
    )
    status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, native_enum=False), default=ModerationStatus.PENDING
    )
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    brand: Mapped["Brand | None"] = relationship(back_populates="products")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    barcodes: Mapped[list["ProductBarcode"]] = relationship(back_populates="product")
    aliases: Mapped[list["ProductAlias"]] = relationship(back_populates="product")


class ProductBarcode(Base):
    """One of possibly many barcodes that resolve to a Product. The same barcode string can
    legitimately identify different products in different stores/countries/distributors, so
    uniqueness is scoped to (barcode, store_id) rather than global.
    """

    __tablename__ = "product_barcodes"
    __table_args__ = (UniqueConstraint("barcode", "store_id", name="uq_product_barcodes_barcode_store"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    barcode: Mapped[str] = mapped_column(String(64), index=True)
    barcode_type: Mapped[BarcodeType] = mapped_column(Enum(BarcodeType, native_enum=False), default=BarcodeType.OTHER)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    source: Mapped[BarcodeSource] = mapped_column(Enum(BarcodeSource, native_enum=False), default=BarcodeSource.USER_SCAN)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, native_enum=False), default=ModerationStatus.PENDING
    )
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="barcodes")


class ProductAlias(Base):
    """A user-submitted alternate name for a Product (e.g. "Leche Estrella" for the canonical
    "Leche Entera 1L Estrella") -- feeds search/matching, never used as an identity key.
    """

    __tablename__ = "product_aliases"
    __table_args__ = (
        UniqueConstraint("product_id", "alias", "language", name="uq_product_aliases_product_alias_language"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    alias: Mapped[str] = mapped_column(String(255), index=True)
    language: Mapped[str] = mapped_column(String(5), default="es")
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, native_enum=False), default=ModerationStatus.PENDING
    )
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="aliases")
