class CouponNotFound(Exception):
    pass


class CouponCodeAlreadyExists(Exception):
    """Raised when `store_id + normalized_code` collides with an existing coupon of the
    same organization. Code uniqueness is scoped per organization, not global (EPIC 10
    Fase 10.10 spec) -- the same code may exist across different organizations."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(f"Coupon code '{code}' already exists for this organization")


class CouponNotPublishable(Exception):
    """Raised when publish is attempted but a required field/relation is missing (name,
    code, discount value, dates, branches when not org-wide, products when not
    whole-purchase)."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class CouponNotEditable(Exception):
    """Raised when a mutation is attempted outside the state it's allowed in -- only a DRAFT
    coupon can be edited or hard-deleted; only a PUBLISHED one can be cancelled."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class CouponPermissionDenied(Exception):
    """Raised when a non-admin (MANAGER/EMPLOYEE) attempts to mutate a coupon. Enforced at the
    service layer (not just the router dependency) so a direct/crafted request can't bypass it
    -- coupons are deliberately admin-only, stricter than Promotions (EPIC 10 Fase 10.10 spec:
    future redemption/limits/fraud/financial impact)."""

    pass
