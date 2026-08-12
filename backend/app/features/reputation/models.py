from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.features.reputation.enums import ReputationAction
from app.shared.models_base import Base


class ReputationEvent(Base):
    """Append-only ledger of every point-earning action -- the raw audit trail a user's total
    reputation is summed from (see `ReputationEventRepository.total_points`), mirroring how
    `PriceHistory`/`PriceConfirmation` are ledgers rather than mutable counters.

    `reference_type`/`reference_id` point at whatever earned the points (a Product, a
    StoreProduct, a ProductMerge, ...) -- deliberately not a DB foreign key since it can point
    at different tables depending on `action`.
    """

    __tablename__ = "reputation_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[ReputationAction] = mapped_column(Enum(ReputationAction, native_enum=False))
    points: Mapped[int] = mapped_column(Integer)
    reference_type: Mapped[str] = mapped_column(String(32))
    reference_id: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
