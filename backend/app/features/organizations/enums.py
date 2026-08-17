import enum


class OrganizationRole(str, enum.Enum):
    """Scopes what a member can manage within their organization (a `Store` chain).

    Branch scope is modeled separately via `OrganizationMemberBranch`, not as a role --
    a branch is an access grant, not a permission level.
    """

    ORGANIZATION_ADMIN = "organization_admin"
    MANAGER = "manager"
    EMPLOYEE = "employee"


class OrganizationMemberStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
