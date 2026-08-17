class PromotionNotFound(Exception):
    pass


class PromotionNotPublishable(Exception):
    """Raised when publish is attempted but the >=1 product, >=1 branch, or "every selected
    product is an ACTIVE listing at every selected branch" requirement isn't met."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class PromotionNotEditable(Exception):
    """Raised when a mutation is attempted outside the state it's allowed in -- only a DRAFT
    promotion can be edited; only a PUBLISHED one can be cancelled."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)
