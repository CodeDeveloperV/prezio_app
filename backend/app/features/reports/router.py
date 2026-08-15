from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.dependencies import get_current_user
from app.features.catalog.exceptions import ProductNotFound
from app.features.organizations.dependencies import get_report_service, require_organization_member
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization
from app.features.organizations.models import OrganizationMember
from app.features.pricing.exceptions import StoreProductNotFound
from app.features.reports.enums import ReportPriority, ReportStatus, ReportType
from app.features.reports.exceptions import (
    InvalidReportScope,
    InvalidReportTransition,
    ReportNotFound,
    ReportPermissionDenied,
)
from app.features.reports.schemas import (
    ReportAssignRequest,
    ReportCreate,
    ReportCreatedRead,
    ReportDismissRequest,
    ReportListRead,
    ReportPriorityUpdate,
    ReportRead,
    ReportResolveRequest,
    ReportStatusUpdate,
    ReportSummaryRead,
)
from app.features.reports.service import ReportService
from app.features.users.models import User

router = APIRouter(prefix="/b2b", tags=["b2b-reports"])
end_user_router = APIRouter(prefix="/reports", tags=["reports"])


@end_user_router.post("", response_model=ReportCreatedRead, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportCreatedRead:
    """The producer endpoint any authenticated client calls to flag a data-quality issue. As of
    Fase 10.11, no mobile screen calls this yet -- `ScanResultScreen` only wires the pre-existing
    `catalog.report_incorrect_barcode` action (barcode-only, auto-rejects the barcode mapping);
    a "report a problem" UI for price/availability/duplicate/product-info issues does not exist
    on mobile yet, so this endpoint currently has no producer besides direct API calls."""
    try:
        report = await service.create_report(payload, current_user.id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product not found") from exc
    except StoreProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Store product not found") from exc
    except InvalidReportScope as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return ReportCreatedRead(id=report.id)


@router.get("/organizations/{store_id}/reports/summary", response_model=ReportSummaryRead)
async def get_reports_summary(
    store_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: ReportService = Depends(get_report_service),
) -> ReportSummaryRead:
    return await service.get_summary(store_id, member)


@router.get("/organizations/{store_id}/reports", response_model=ReportListRead)
async def list_reports(
    store_id: int,
    status_filter: ReportStatus | None = None,
    type: ReportType | None = None,
    priority: ReportPriority | None = None,
    branch_id: int | None = None,
    product_id: int | None = None,
    store_product_id: int | None = None,
    assigned_to_user_id: int | None = None,
    unassigned: bool = False,
    only_open: bool = False,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str | None = None,
    page: int = 1,
    page_size: int = 20,
    member: OrganizationMember = Depends(require_organization_member),
    service: ReportService = Depends(get_report_service),
) -> ReportListRead:
    try:
        return await service.list_reports(
            store_id,
            member,
            status=status_filter,
            type=type,
            priority=priority,
            branch_id=branch_id,
            product_id=product_id,
            store_product_id=store_product_id,
            assigned_to_user_id=assigned_to_user_id,
            unassigned=unassigned,
            only_open=only_open,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            page=page,
            page_size=page_size,
        )
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.get("/organizations/{store_id}/reports/{report_id}", response_model=ReportRead)
async def get_report(
    store_id: int,
    report_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.get_report(store_id, member, report_id)
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc


@router.post("/organizations/{store_id}/reports/{report_id}/take", response_model=ReportRead)
async def take_report(
    store_id: int,
    report_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.take_report(store_id, member, report_id, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc
    except InvalidReportTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc


@router.patch("/organizations/{store_id}/reports/{report_id}/status", response_model=ReportRead)
async def update_report_status(
    store_id: int,
    report_id: int,
    payload: ReportStatusUpdate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    if payload.status != ReportStatus.IN_REVIEW:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only a transition to in_review is supported here")
    try:
        return await service.mark_in_review(store_id, member, report_id, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc
    except InvalidReportTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc


@router.post("/organizations/{store_id}/reports/{report_id}/assign", response_model=ReportRead)
async def assign_report(
    store_id: int,
    report_id: int,
    payload: ReportAssignRequest,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.assign_report(store_id, member, report_id, payload, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc
    except InvalidReportTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc


@router.patch("/organizations/{store_id}/reports/{report_id}/priority", response_model=ReportRead)
async def update_report_priority(
    store_id: int,
    report_id: int,
    payload: ReportPriorityUpdate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.update_priority(store_id, member, report_id, payload, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc


@router.post("/organizations/{store_id}/reports/{report_id}/resolve", response_model=ReportRead)
async def resolve_report(
    store_id: int,
    report_id: int,
    payload: ReportResolveRequest,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.resolve_report(store_id, member, report_id, payload, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc
    except InvalidReportTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc


@router.post("/organizations/{store_id}/reports/{report_id}/dismiss", response_model=ReportRead)
async def dismiss_report(
    store_id: int,
    report_id: int,
    payload: ReportDismissRequest,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: ReportService = Depends(get_report_service),
) -> ReportRead:
    try:
        return await service.dismiss_report(store_id, member, report_id, payload, current_user.id)
    except ReportPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ReportNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found") from exc
    except InvalidReportTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
