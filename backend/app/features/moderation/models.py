from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.enums import ModerationStatus
from app.shared.models_base import Base


class ProductMerge(Base):
    """A proposal to fuse a duplicate `source_product` into the canonical `target_product`.

    Approving it (see `moderation.merge_engine.execute_product_merge`) migrates every barcode,
    alias, price and price-history row from the source onto the target and marks the source as
    MERGED -- the source is never deleted, so this row is also the permanent audit trail of
    what got merged into what.
    """

    __tablename__ = "product_merges"
    __table_args__ = (
        CheckConstraint("source_product_id <> target_product_id", name="ck_product_merges_distinct_products"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    target_product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, native_enum=False), default=ModerationStatus.PENDING
    )
    reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    proposed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    source_product: Mapped["Product"] = relationship(foreign_keys=[source_product_id])  # noqa: F821
    target_product: Mapped["Product"] = relationship(foreign_keys=[target_product_id])  # noqa: F821
