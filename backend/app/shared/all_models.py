"""Imports every feature's models so Base.metadata is complete for Alembic and tests.

Nothing here is used directly; the import side effects register each table on Base.
"""

from app.features.alerts.models import PriceAlert  # noqa: F401
from app.features.auth.models import Session  # noqa: F401
from app.features.catalog.models import Brand, Category, Product, ProductAlias, ProductBarcode  # noqa: F401
from app.features.moderation.models import ProductMerge  # noqa: F401
from app.features.notifications.models import Notification  # noqa: F401
from app.features.organizations.models import OrganizationMember, OrganizationMemberBranch  # noqa: F401
from app.features.pricing.models import PriceConfirmation, PriceHistory, StoreProduct  # noqa: F401
from app.features.promotions.models import Promotion, PromotionBranch, PromotionProduct  # noqa: F401
from app.features.reputation.models import ReputationEvent  # noqa: F401
from app.features.shopping_lists.models import (  # noqa: F401
    ShoppingList,
    ShoppingListInvitation,
    ShoppingListItem,
    ShoppingListMember,
)
from app.features.stores.models import Store, StoreBranch  # noqa: F401
from app.features.users.models import User, UserProfile  # noqa: F401
