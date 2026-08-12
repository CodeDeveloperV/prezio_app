from datetime import datetime

from pydantic import BaseModel

from app.features.reputation.enums import ReputationAction, ReputationLevel
from app.shared.base_schemas import ORMModel


class ReputationEventRead(ORMModel):
    id: int
    user_id: int
    action: ReputationAction
    points: int
    reference_type: str
    reference_id: int
    created_at: datetime


class UserReputationRead(BaseModel):
    user_id: int
    total_points: int
    level: ReputationLevel
    points_to_next_level: int | None
    auto_approval_enabled: bool
