from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.shared.base_schemas import ORMModel


class UserRead(ORMModel):
    id: int
    email: str
    is_active: bool
    created_at: datetime


class UserBudgetUpdate(BaseModel):
    monthly_budget: Decimal | None


class UserBudgetRead(BaseModel):
    monthly_budget: Decimal | None
