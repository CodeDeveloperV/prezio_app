from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models_base import Base


class PriceAlert(Base):
    """"Avísame cuando <product> esté por debajo de <target_price>."

    Scope is layered by how many of `store_id`/`store_branch_id` are set: neither means "any
    branch of any chain", `store_id` alone means "any branch of that chain", and
    `store_branch_id` means that specific branch only (see PriceAlertService.create -- the two
    are mutually exclusive).

    Deliberately no ACTIVE/TRIGGERED enum: `is_below_threshold` is the re-armable
    threshold-crossing state (flips back to False once the price rises back above
    `target_price`, so the next crossing below notifies again), `active` is just an on/off
    switch independent of that state, and `last_triggered_at` is only bookkeeping for display.
    """

    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True, index=True)
    store_branch_id: Mapped[int | None] = mapped_column(ForeignKey("store_branches.id"), nullable=True, index=True)
    target_price: Mapped[float] = mapped_column(Numeric(10, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_below_threshold: Mapped[bool] = mapped_column(Boolean, default=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
