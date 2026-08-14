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


class BranchAccessDenied(Exception):
    """Raised when a MANAGER/EMPLOYEE targets a branch that belongs to their organization but
    that they haven't been explicitly granted access to (vs. `InvalidBranchForOrganization`,
    which is for a branch that isn't part of the organization at all)."""

    pass


class ListingNotActive(Exception):
    """Raised when the B2B portal's Pricing screen (Fase 10.6) is asked to update the
    price/availability of a StoreProduct whose listing_status is INACTIVE. Reactivating a
    listing is a Fase 10.5 concern (Catálogo -> "Agregar a sucursal"), not a pricing one."""

    def __init__(self, store_product_id: int) -> None:
        self.store_product_id = store_product_id
        super().__init__(f"Store product {store_product_id} is not an active listing")
