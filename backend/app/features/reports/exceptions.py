class ReportNotFound(Exception):
    def __init__(self, report_id: int) -> None:
        self.report_id = report_id
        super().__init__(f"Report {report_id} not found")


class ReportPermissionDenied(Exception):
    """Raised when an EMPLOYEE (read-only per Fase 10.11 spec section 10) attempts a write
    action, or any other role-based operation is disallowed."""


class InvalidReportScope(Exception):
    """Raised when the product_id/store_product_id/store_branch_id combination on a report
    creation payload references entities that don't exist or don't relate to each other."""


class InvalidReportTransition(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)
