from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator

from app.features.reports.enums import REQUIRED_SCOPE_BY_TYPE, ReportPriority, ReportResolutionType, ReportStatus, ReportType


class ReportCreate(BaseModel):
    """Submitted by any authenticated end user (mobile or otherwise) to flag a data-quality
    issue -- not part of the B2B router, since reporting doesn't require organization
    membership. See `REQUIRED_SCOPE_BY_TYPE` for the per-type scope validation (spec section 4).
    """

    type: ReportType
    product_id: int | None = None
    store_product_id: int | None = None
    store_branch_id: int | None = None
    description: str | None = None
    reported_value: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _scope_matches_type(self) -> "ReportCreate":
        required = REQUIRED_SCOPE_BY_TYPE[self.type]
        for field in required:
            if getattr(self, field) is None:
                raise ValueError(f"{field} is required for report type {self.type.value}")
        if not required and self.product_id is None and self.store_product_id is None and self.store_branch_id is None:
            raise ValueError("At least one of product_id, store_product_id, store_branch_id is required")
        return self


class ReportCreatedRead(BaseModel):
    id: int


class ReportActivityRead(BaseModel):
    id: int
    actor_user_id: int | None
    action: str
    note: str | None
    created_at: datetime


class ReportRead(BaseModel):
    id: int
    type: ReportType
    status: ReportStatus
    priority: ReportPriority

    reporter_user_id: int

    product_id: int | None
    product_name: str | None
    store_product_id: int | None
    store_branch_id: int | None
    branch_name: str | None
    barcode: str | None

    description: str | None
    reported_value: dict[str, Any] | None
    current_value_snapshot: dict[str, Any] | None

    assigned_to_user_id: int | None

    resolution_type: ReportResolutionType | None
    resolution_note: str | None
    resolved_by: int | None
    resolved_at: datetime | None
    dismissed_by: int | None
    dismissed_at: datetime | None

    group_report_count: int
    first_reported_at: datetime
    latest_reported_at: datetime

    created_at: datetime
    updated_at: datetime

    activities: list[ReportActivityRead]


class ReportListItemRead(BaseModel):
    id: int
    type: ReportType
    status: ReportStatus
    priority: ReportPriority
    product_id: int | None
    product_name: str | None
    store_product_id: int | None
    store_branch_id: int | None
    branch_name: str | None
    current_price: float | None
    reported_price: float | None
    assigned_to_user_id: int | None
    group_report_count: int
    latest_reported_at: datetime
    created_at: datetime


class ReportListRead(BaseModel):
    items: list[ReportListItemRead]
    total: int
    page: int
    page_size: int


class ReportSummaryRead(BaseModel):
    open_count: int
    in_review_count: int
    high_priority_open_count: int
    resolved_this_week_count: int


class ReportStatusUpdate(BaseModel):
    status: ReportStatus


class ReportAssignRequest(BaseModel):
    assigned_to_user_id: int | None = None  # None => assign to the caller


class ReportPriorityUpdate(BaseModel):
    priority: ReportPriority


class ReportResolveRequest(BaseModel):
    resolution_type: ReportResolutionType
    resolution_note: str | None = None


class ReportDismissRequest(BaseModel):
    resolution_note: str | None = None
