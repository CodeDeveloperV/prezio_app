from datetime import datetime

from pydantic import BaseModel

from app.shared.base_schemas import ORMModel
from app.shared.enums import ModerationStatus


class ProductMergeRead(ORMModel):
    id: int
    source_product_id: int
    target_product_id: int
    status: ModerationStatus
    reason: str | None
    proposed_by: int | None
    reviewed_by: int | None
    reviewed_at: datetime | None
    created_at: datetime


class ProposeProductMergeRequest(BaseModel):
    source_product_id: int
    target_product_id: int
    reason: str | None = None


class MoveBarcodeRequest(BaseModel):
    target_product_id: int


class MoveAliasRequest(BaseModel):
    target_product_id: int


class RejectRequest(BaseModel):
    reason: str | None = None
