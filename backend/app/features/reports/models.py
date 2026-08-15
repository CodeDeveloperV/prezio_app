from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.reports.enums import ReportPriority, ReportResolutionType, ReportStatus, ReportType
from app.shared.models_base import Base


class Report(Base):
    """A single data-quality issue raised by an end user against a product/store_product/
    branch (EPIC 10 Fase 10.11). This is a domain fully separate from `moderation`'s
    `ProductMerge`/`ModerationStatus` (global catalog review workflow) and from `catalog`'s
    `report_incorrect_barcode` (a barcode-only auto-reject action) -- neither models a
    multi-type, org/branch-scoped, operator-worked incident. Reports about the same
    entity+type are never physically merged; see `ReportRepository.list_group_siblings` /
    `ReportService._group` for the read-model grouping used instead (spec section 8).

    `store_id` is denormalized from `store_branch_id`/`store_product_id` at creation time
    purely as a query-efficiency shortcut for the B2B portal's tenant filter -- it is derived
    server-side and never trusted from client input. A pure `product_id` report (e.g.
    DUPLICATE_PRODUCT) has no single owning organization, so `store_id` stays null and
    visibility for it is computed instead from whether the requesting organization currently
    lists that product (see `ReportService._visibility_params`). Whenever a report does have a
    branch scope, `store_branch_id` is always populated too (even for types that only require
    `store_product_id`), so branch-based visibility/filtering never needs to fall back to a
    join through `store_products`.
    """

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True, index=True)
    type: Mapped[ReportType] = mapped_column(Enum(ReportType, native_enum=False), index=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, native_enum=False), default=ReportStatus.OPEN, index=True
    )
    priority: Mapped[ReportPriority] = mapped_column(Enum(ReportPriority, native_enum=False))

    reporter_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    store_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("store_products.id"), nullable=True, index=True
    )
    store_branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("store_branches.id"), nullable=True, index=True
    )

    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    reported_value: Mapped[dict | None] = mapped_column(JSON(), nullable=True)
    current_value_snapshot: Mapped[dict | None] = mapped_column(JSON(), nullable=True)

    assigned_to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    resolution_type: Mapped[ReportResolutionType | None] = mapped_column(
        Enum(ReportResolutionType, native_enum=False), nullable=True
    )
    resolution_note: Mapped[str | None] = mapped_column(Text(), nullable=True)

    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    activities: Mapped[list["ReportActivity"]] = relationship(
        back_populates="report", cascade="all, delete-orphan", order_by="ReportActivity.id"
    )


class ReportActivity(Base):
    """Minimal audit trail for a Report's operational lifecycle (status changed, assigned,
    resolved, dismissed) -- there is no generic audit-event infrastructure in the codebase to
    hook into, so this is a small dedicated table rather than event sourcing (spec section 22).
    """

    __tablename__ = "report_activity"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    report: Mapped["Report"] = relationship(back_populates="activities")
