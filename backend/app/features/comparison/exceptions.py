class EmptyShoppingList(Exception):
    pass


class NoCandidateBranches(Exception):
    """Raised when the request gives neither a `city` nor explicit `store_branch_ids` --
    comparing against every branch in the country would be meaningless, not "smart"."""

    pass
