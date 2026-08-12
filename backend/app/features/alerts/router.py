from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.alerts.exceptions import InvalidPriceAlertScope, PriceAlertAccessDenied, PriceAlertNotFound
from app.features.alerts.repository import PriceAlertRepository
from app.features.alerts.schemas import PriceAlertCreateRequest, PriceAlertRead, PriceAlertUpdateRequest
from app.features.alerts.service import PriceAlertService
from app.features.auth.dependencies import get_current_user
from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.repository import ProductRepository
from app.features.stores.exceptions import StoreBranchNotFound, StoreNotFound
from app.features.stores.repository import StoreBranchRepository, StoreRepository
from app.features.users.models import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


def get_price_alert_service(db: AsyncSession = Depends(get_db)) -> PriceAlertService:
    return PriceAlertService(
        db,
        PriceAlertRepository(db),
        ProductRepository(db),
        StoreRepository(db),
        StoreBranchRepository(db),
    )


@router.post("", response_model=PriceAlertRead, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: PriceAlertCreateRequest,
    current_user: User = Depends(get_current_user),
    service: PriceAlertService = Depends(get_price_alert_service),
) -> PriceAlertRead:
    try:
        alert = await service.create(
            current_user.id,
            product_id=payload.product_id,
            target_price=payload.target_price,
            store_id=payload.store_id,
            store_branch_id=payload.store_branch_id,
        )
    except InvalidPriceAlertScope as exc:
        raise HTTPException(400, str(exc)) from exc
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except StoreNotFound as exc:
        raise HTTPException(404, "Store not found") from exc
    except StoreBranchNotFound as exc:
        raise HTTPException(404, "Store branch not found") from exc

    alerts = await service.list_for_user(current_user.id)
    return next(a for a in alerts if a.id == alert.id)


@router.get("", response_model=list[PriceAlertRead])
async def list_my_alerts(
    current_user: User = Depends(get_current_user),
    service: PriceAlertService = Depends(get_price_alert_service),
) -> list[PriceAlertRead]:
    return await service.list_for_user(current_user.id)


@router.patch("/{alert_id}", response_model=PriceAlertRead)
async def update_alert(
    alert_id: int,
    payload: PriceAlertUpdateRequest,
    current_user: User = Depends(get_current_user),
    service: PriceAlertService = Depends(get_price_alert_service),
) -> PriceAlertRead:
    try:
        await service.update(
            alert_id,
            current_user.id,
            target_price=payload.target_price,
            active=payload.active,
        )
    except PriceAlertNotFound as exc:
        raise HTTPException(404, "Alert not found") from exc
    except PriceAlertAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this alert") from exc

    alerts = await service.list_for_user(current_user.id)
    return next(a for a in alerts if a.id == alert_id)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    service: PriceAlertService = Depends(get_price_alert_service),
) -> None:
    try:
        await service.delete(alert_id, current_user.id)
    except PriceAlertNotFound as exc:
        raise HTTPException(404, "Alert not found") from exc
    except PriceAlertAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this alert") from exc
