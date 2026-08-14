class OrganizationMembershipNotFound(Exception):
    pass


class UserNotFoundForInvite(Exception):
    """Raised when inviting by email but no Prezio account exists for that address.

    The portal never creates accounts on invite -- see EPIC 10 section 20.
    """

    pass


class OrganizationMemberAlreadyExists(Exception):
    pass


class InvalidBranchForOrganization(Exception):
    """Raised when a branch_id passed for access assignment doesn't belong to the store."""

    pass


class LastOrganizationAdminError(Exception):
    """Raised when an action would leave the organization with no active admin."""

    pass


class BranchNotFound(Exception):
    """Raised when a branch_id doesn't exist or doesn't belong to the organization."""

    pass
