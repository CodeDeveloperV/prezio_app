from app.features.reputation.enums import ReputationAction, ReputationLevel
from app.features.reputation.models import ReputationEvent
from app.features.reputation.repository import ReputationEventRepository

# How many points each action is worth. Weighted so a single validated contribution
# (a product actually getting approved, a duplicate report actually confirmed) counts for
# more than routine collaborative upkeep (confirming/updating a price) -- both matter, but
# the former required someone else independently agreeing the contribution was correct.
POINTS: dict[ReputationAction, int] = {
    ReputationAction.CONFIRM_PRICE: 2,
    ReputationAction.UPDATE_PRICE: 3,
    ReputationAction.CREATE_PRODUCT_APPROVED: 10,
    ReputationAction.REPORT_DUPLICATE_APPROVED: 8,
}

# Ascending point thresholds a user must reach to be considered at that level.
LEVEL_THRESHOLDS: list[tuple[int, ReputationLevel]] = [
    (0, ReputationLevel.NIVEL_1),
    (50, ReputationLevel.NIVEL_2),
    (150, ReputationLevel.EXPERTO),
    (400, ReputationLevel.MODERADOR),
]

# Reaching this level lets a user's own submissions skip the PENDING moderation queue (see
# `CatalogResolutionEngine.create_new_product`). This is *not* the same as `User.is_moderator`,
# which grants rights to review *other* users' submissions -- see `ReputationLevel`.
AUTO_APPROVAL_LEVEL = ReputationLevel.MODERADOR


def level_for_points(points: int) -> ReputationLevel:
    level = LEVEL_THRESHOLDS[0][1]
    for threshold, candidate in LEVEL_THRESHOLDS:
        if points >= threshold:
            level = candidate
    return level


def points_to_next_level(points: int) -> int | None:
    """None once the user has reached the top level."""
    for threshold, _level in LEVEL_THRESHOLDS:
        if points < threshold:
            return threshold - points
    return None


def _threshold_for(level: ReputationLevel) -> int:
    return next(threshold for threshold, candidate in LEVEL_THRESHOLDS if candidate is level)


class ReputationService:
    def __init__(self, events: ReputationEventRepository) -> None:
        self.events = events

    async def award(self, *, user_id: int, action: ReputationAction, reference_type: str, reference_id: int) -> ReputationEvent:
        """Records a point-earning event. Only flushes (does not commit) -- callers award
        points as part of the same transaction as the action that earned them (a price
        update, a moderation approval, ...) so the two can never diverge."""
        return await self.events.add(
            ReputationEvent(
                user_id=user_id,
                action=action,
                points=POINTS[action],
                reference_type=reference_type,
                reference_id=reference_id,
            )
        )

    async def get_total_points(self, user_id: int) -> int:
        return await self.events.total_points(user_id)

    async def get_level(self, user_id: int) -> ReputationLevel:
        return level_for_points(await self.get_total_points(user_id))

    async def qualifies_for_auto_approval(self, user_id: int) -> bool:
        return await self.get_total_points(user_id) >= _threshold_for(AUTO_APPROVAL_LEVEL)
