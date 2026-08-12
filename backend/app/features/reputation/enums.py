import enum


class ReputationAction(str, enum.Enum):
    """Every way a user can earn reputation points. One `ReputationEvent` row is written per
    occurrence -- see `ReputationService.POINTS` for how much each is worth."""

    CONFIRM_PRICE = "confirm_price"  # "✓ Coincide" on a StoreProduct's price.
    UPDATE_PRICE = "update_price"  # A price update that passed optimistic-concurrency checks.
    CREATE_PRODUCT_APPROVED = "create_product_approved"  # A Product they created reached APPROVED.
    REPORT_DUPLICATE_APPROVED = "report_duplicate_approved"  # A merge they proposed was approved.


class ReputationLevel(str, enum.Enum):
    """Progression a contributor climbs as their point total grows. Distinct from
    `User.is_moderator` (which grants rights over *other* users' submissions in the
    moderation queue) -- reaching MODERADOR here only grants trust over *your own* future
    submissions (see `ReputationService.qualifies_for_auto_approval`)."""

    NIVEL_1 = "nivel_1"
    NIVEL_2 = "nivel_2"
    EXPERTO = "experto"
    MODERADOR = "moderador"
