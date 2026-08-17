import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.exceptions import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    InvalidRefreshToken,
)
from app.features.auth.google_oauth import InvalidGoogleToken
from app.features.auth.schemas import (
    GoogleLoginRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.features.auth.service import AuthService
from app.features.users.schemas import UserRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> UserRead:
    try:
        user = await AuthService(db).register(payload.email, payload.password)
    except EmailAlreadyRegistered as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from exc
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        return await AuthService(db).login(payload.email, payload.password)
    except InvalidCredentials as exc:
        logger.warning("Failed login attempt for email=%s", payload.email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password") from exc


@router.post("/login/google", response_model=TokenResponse)
async def login_google(payload: GoogleLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        return await AuthService(db).login_with_google(payload.id_token)
    except InvalidGoogleToken as exc:
        logger.warning("Rejected Google login: invalid id_token")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google id_token") from exc


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        return await AuthService(db).refresh(payload.refresh_token)
    except InvalidRefreshToken as exc:
        logger.warning("Rejected refresh: invalid or expired refresh token")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token") from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db)) -> None:
    await AuthService(db).logout(payload.refresh_token)
