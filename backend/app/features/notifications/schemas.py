from datetime import datetime

from pydantic import BaseModel, Field

from app.features.notifications.enums import NotificationType
from app.shared.base_schemas import ORMModel


class NotificationRead(ORMModel):
    id: int
    user_id: int
    type: NotificationType
    title: str
    message: str
    related_entity_type: str | None
    related_entity_id: int | None
    alert_id: int | None
    # ORM attribute is `metadata_json` (SQLAlchemy reserves `metadata`) -- the wire field stays
    # `metadata`, read from that attribute via validation_alias.
    metadata: dict | None = Field(validation_alias="metadata_json")
    read_at: datetime | None
    created_at: datetime


class MarkAllReadResponse(BaseModel):
    marked_read: int
