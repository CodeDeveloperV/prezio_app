from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.catalog.repository import ProductRepository
from app.features.comparison.exceptions import EmptyShoppingList, NoCandidateBranches
from app.features.comparison.schemas import CompareShoppingListRequest, ShoppingListComparisonResult
from app.features.comparison.service import ComparisonService
from app.features.pricing.repository import StoreProductRepository
from app.features.shopping_lists.exceptions import ShoppingListAccessDenied, ShoppingListNotFound
from app.features.shopping_lists.repository import ShoppingListItemRepository, ShoppingListRepository
from app.features.stores.repository import StoreBranchRepository
from app.features.users.models import User

router = APIRouter(prefix="/comparison", tags=["comparison"])


def get_comparison_service(db: AsyncSession = Depends(get_db)) -> ComparisonService:
    settings = get_settings()
    return ComparisonService(
        ShoppingListRepository(db),
        ShoppingListItemRepository(db),
        ProductRepository(db),
        StoreBranchRepository(db),
        StoreProductRepository(db),
        min_coverage=settings.min_comparison_coverage,
        min_fresh_coverage=settings.min_fresh_comparison_coverage,
        price_freshness_days=settings.price_freshness_days,
    )


@router.post(
    "/shopping-lists/{shopping_list_id}/compare",
    response_model=ShoppingListComparisonResult,
)
async def compare_shopping_list(
    shopping_list_id: int,
    payload: CompareShoppingListRequest,
    current_user: User = Depends(get_current_user),
    service: ComparisonService = Depends(get_comparison_service),
) -> ShoppingListComparisonResult:
    try:
        return await service.compare_shopping_list(
            shopping_list_id,
            current_user.id,
            city=payload.city,
            store_branch_ids=payload.store_branch_ids,
        )
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListAccessDenied as exc:
        raise HTTPException(403, "You do not own this shopping list") from exc
    except EmptyShoppingList as exc:
        raise HTTPException(400, "Shopping list has no items to compare") from exc
    except NoCandidateBranches as exc:
        raise HTTPException(400, "Provide a city or explicit store_branch_ids to compare against") from exc
