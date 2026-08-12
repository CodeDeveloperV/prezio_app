import enum


class ModerationStatus(str, enum.Enum):
    """Applies uniformly to every reviewable catalog entity (products, barcodes, aliases,
    product merges) so the moderation queue/actions work the same way regardless of entity type.
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MERGED = "merged"
