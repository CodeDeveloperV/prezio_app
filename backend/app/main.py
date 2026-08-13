from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.alert_scheduler import alert_scheduler
from app.core.config import get_settings
from app.core.websocket_manager import redis_listener
from app.features.alerts.router import router as alerts_router
from app.features.auth.router import router as auth_router
from app.features.catalog.router import router as catalog_router
from app.features.comparison.router import router as comparison_router
from app.features.dashboard.router import router as dashboard_router
from app.features.moderation.router import router as moderation_router
from app.features.notifications.router import router as notifications_router
from app.features.pricing.router import router as pricing_router
from app.features.reputation.router import router as reputation_router
from app.features.shopping_lists.router import invitations_router as shopping_list_invitations_router
from app.features.shopping_lists.router import router as shopping_lists_router
from app.features.stores.router import router as stores_router
from app.features.users.router import router as users_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_listener.start()
    alert_scheduler.start()
    yield
    await alert_scheduler.stop()
    await redis_listener.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(stores_router)
app.include_router(catalog_router)
app.include_router(comparison_router)
app.include_router(moderation_router)
app.include_router(pricing_router)
app.include_router(reputation_router)
app.include_router(shopping_lists_router)
app.include_router(shopping_list_invitations_router)
app.include_router(notifications_router)
app.include_router(alerts_router)
app.include_router(dashboard_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
