from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.features.notifications.enums import NotificationType
from app.shared.models_base import Base


class Notification(Base):
    """A single in-app inbox entry. Deliberately generic (not price-alert-specific) so the same
    table/endpoints serve future notification types (collaborative lists, coupons, promotions,
    system messages) without a schema change -- `related_entity_type`/`related_entity_id` point
    at whatever triggered it, and `alert_id` is only ever set for `type == PRICE_ALERT`.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType, native_enum=False))
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text())
    related_entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Raw FK (no relationship) -- mirrors the codebase convention for cross-feature references
    # that don't need eager-loaded object access, and avoids a notifications<->alerts import cycle.
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("price_alerts.id"), nullable=True, index=True)
    # Named metadata_json (not `metadata`) because `metadata` is reserved on every SQLAlchemy
    # declarative model (Base.metadata) -- the wire schema still exposes this as `metadata`.
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
