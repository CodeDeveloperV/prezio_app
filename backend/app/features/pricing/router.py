from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.core.websocket_manager import connection_manager
from app.features.auth.dependencies import get_current_user
from app.features.pricing.exceptions import PriceVersionConflict, StoreProductNotFound
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.features.pricing.schemas import (
    PriceHistoryRead,
    PriceUpdateRequest,
    StoreProductRead,
    TaxRateRead,
    UserReputationRead,
)
from app.features.pricing.tax_repository import TaxRateRepository
from app.features.pricing.service import PricingService
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.service import ReputationService
from app.features.users.models import User

router = APIRouter(prefix="/pricing", tags=["pricing"])


def get_pricing_service(db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)) -> PricingService:
    return PricingService(
        db,
        StoreProductRepository(db),
        PriceHistoryRepository(db),
        PriceConfirmationRepository(db),
        redis,
        ReputationService(ReputationEventRepository(db)),
    )


@router.get("/tax-rates", response_model=list[TaxRateRead])
async def list_tax_rates(
    country: str = Query(min_length=2, max_length=2),
    db: AsyncSession = Depends(get_db),
) -> list[TaxRateRead]:
    """Lists active rates for a country; a listing with no selected rate is exempt/not taxed."""
    rates = await TaxRateRepository(db).list_active_by_country(country)
    return [TaxRateRead.model_validate(rate) for rate in rates]


@router.post("/store-products/{store_product_id}/price", response_model=StoreProductRead)
async def update_store_product_price(
    store_product_id: int,
    payload: PriceUpdateRequest,
    current_user: User = Depends(get_current_user),
    service: PricingService = Depends(get_pricing_service),
) -> StoreProductRead | JSONResponse:
    try:
        updated = await service.update_price(
            store_product_id, payload.price, payload.version, current_user.id
        )
    except StoreProductNotFound as exc:
        raise HTTPException(404, "Store product not found") from exc
    except PriceVersionConflict as exc:
        # Client's version is stale: hand back the server's authoritative state so it can retry.
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Price was updated concurrently by someone else",
                "current_price": str(exc.current_price),
                "version": exc.current_version,
            },
        )

    return StoreProductRead.model_validate(updated)


@router.post("/store-products/{store_product_id}/confirm", response_model=StoreProductRead)
async def confirm_store_product_match(
    store_product_id: int,
    current_user: User = Depends(get_current_user),
    service: PricingService = Depends(get_pricing_service),
) -> StoreProductRead:
    """"✓ Coincide": user confirmed the displayed price is still accurate."""
    try:
        updated = await service.confirm_match(store_product_id, current_user.id)
    except StoreProductNotFound as exc:
        raise HTTPException(404, "Store product not found") from exc

    return StoreProductRead.model_validate(updated)


@router.get("/store-products/{store_product_id}/history", response_model=list[PriceHistoryRead])
async def get_store_product_price_history(
    store_product_id: int,
    current_user: User = Depends(get_current_user),
    service: PricingService = Depends(get_pricing_service),
) -> list[PriceHistoryRead]:
    try:
        return await service.list_price_history(store_product_id)
    except StoreProductNotFound as exc:
        raise HTTPException(404, "Store product not found") from exc


@router.get("/users/{user_id}/reputation", response_model=UserReputationRead)
async def get_user_reputation(
    user_id: int,
    current_user: User = Depends(get_current_user),
    service: PricingService = Depends(get_pricing_service),
) -> UserReputationRead:
    """Reputation is simply how many price confirmations a user has made -- every "✓ Coincide"
    counts as a correct confirmation, so no separate correctness judgement is stored. Superseded
    by the broader levelled system at `GET /reputation/users/{user_id}` -- kept for backward
    compatibility with existing clients."""
    correct_confirmations = await service.get_reputation(user_id)
    return UserReputationRead(user_id=user_id, correct_confirmations=correct_confirmations)


@router.websocket("/ws")
async def price_updates_ws(websocket: WebSocket) -> None:
    """Clients send {"action": "subscribe"|"unsubscribe", "store_product_id": <int>}
    to manage which price topics they receive on this single connection."""
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")
            topic = str(message.get("store_product_id"))

            if action == "subscribe":
                connection_manager.subscribe(websocket, topic)
            elif action == "unsubscribe":
                connection_manager.unsubscribe(websocket, topic)
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
