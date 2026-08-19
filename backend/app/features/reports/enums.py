import enum


class ReportType(str, enum.Enum):
    INCORRECT_PRODUCT_INFO = "incorrect_product_info"
    INCORRECT_BARCODE = "incorrect_barcode"
    DUPLICATE_PRODUCT = "duplicate_product"
    INCORRECT_PRICE = "incorrect_price"
    INCORRECT_AVAILABILITY = "incorrect_availability"
    PRODUCT_NOT_SOLD_HERE = "product_not_sold_here"
    OTHER = "other"


class ProductCorrectionKind(str, enum.Enum):
    WRONG_PRODUCT = "wrong_product"
    WRONG_NAME = "wrong_name"
    WRONG_BRAND = "wrong_brand"
    WRONG_PRESENTATION = "wrong_presentation"
    WRONG_IMAGE = "wrong_image"


class ReportStatus(str, enum.Enum):
    OPEN = "open"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReportPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReportResolutionType(str, enum.Enum):
    DATA_CORRECTED = "data_corrected"
    PRICE_UPDATED = "price_updated"
    AVAILABILITY_UPDATED = "availability_updated"
    LISTING_DISABLED = "listing_disabled"
    ESCALATED_TO_CATALOG_MODERATION = "escalated_to_catalog_moderation"
    NO_ISSUE_FOUND = "no_issue_found"
    DUPLICATE_CONFIRMED = "duplicate_confirmed"
    OTHER = "other"


# Initial priority assigned at creation time (EPIC 10 Fase 10.11 spec section 7). An
# ORGANIZATION_ADMIN/MANAGER may override it afterwards via `ReportService.update_priority`.
DEFAULT_PRIORITY_BY_TYPE: dict[ReportType, ReportPriority] = {
    ReportType.INCORRECT_PRODUCT_INFO: ReportPriority.MEDIUM,
    ReportType.INCORRECT_BARCODE: ReportPriority.HIGH,
    ReportType.DUPLICATE_PRODUCT: ReportPriority.HIGH,
    ReportType.INCORRECT_PRICE: ReportPriority.MEDIUM,
    ReportType.INCORRECT_AVAILABILITY: ReportPriority.MEDIUM,
    ReportType.PRODUCT_NOT_SOLD_HERE: ReportPriority.MEDIUM,
    ReportType.OTHER: ReportPriority.LOW,
}

# Which scope fields a report type requires (EPIC 10 Fase 10.11 spec section 4) -- enforced by
# `ReportCreate`'s validator so no structurally invalid report can be created.
REQUIRED_SCOPE_BY_TYPE: dict[ReportType, tuple[str, ...]] = {
    ReportType.INCORRECT_PRODUCT_INFO: ("product_id",),
    ReportType.INCORRECT_BARCODE: ("product_id",),
    ReportType.DUPLICATE_PRODUCT: ("product_id",),
    ReportType.INCORRECT_PRICE: ("store_product_id",),
    ReportType.INCORRECT_AVAILABILITY: ("store_product_id",),
    ReportType.PRODUCT_NOT_SOLD_HERE: ("store_product_id", "store_branch_id"),
    ReportType.OTHER: (),
}
