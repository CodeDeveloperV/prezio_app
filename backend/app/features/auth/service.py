from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.features.auth.exceptions import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    InvalidRefreshToken,
)
from app.features.auth.google_oauth import verify_google_id_token
from app.features.auth.models import Session
from app.features.auth.repository import SessionRepository
from app.features.auth.schemas import TokenResponse
from app.features.users.models import User
from app.features.users.repository import UserRepository

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.sessions = SessionRepository(db)

    async def register(self, email: str, password: str) -> User:
        if await self.users.get_by_email(email) is not None:
            raise EmailAlreadyRegistered(email)

        user = User(email=email, hashed_password=hash_password(password))
        await self.users.add(user)
        await self.db.commit()
        return user

    async def login(self, email: str, password: str) -> TokenResponse:
        user = await self.users.get_by_email(email)
        if user is None or user.hashed_password is None or not verify_password(
            password, user.hashed_password
        ):
            raise InvalidCredentials()

        tokens = await self._issue_tokens(user)
        await self.db.commit()
        return tokens

    async def login_with_google(self, id_token: str) -> TokenResponse:
        claims = await verify_google_id_token(id_token, settings.google_client_id)
        google_id: str = claims["sub"]
        email: str | None = claims.get("email")

        user = await self.users.get_by_google_id(google_id)
        if user is None and email:
            user = await self.users.get_by_email(email)
            if user is not None:
                user.google_id = google_id  # link existing account created via password signup

        if user is None:
            user = User(email=email, google_id=google_id, hashed_password=None)
            await self.users.add(user)

        tokens = await self._issue_tokens(user)
        await self.db.commit()
        return tokens

    async def refresh(self, raw_refresh_token: str) -> TokenResponse:
        session = await self.sessions.get_by_token_hash(hash_refresh_token(raw_refresh_token))
        if session is None or not SessionRepository.is_valid(session):
            raise InvalidRefreshToken()

        # Rotate on every use: old refresh token is single-use, a fresh one replaces it.
        await self.sessions.revoke(session)
        user = await self.users.get_by_id(session.user_id)
        if user is None:
            raise InvalidRefreshToken()

        tokens = await self._issue_tokens(user)
        await self.db.commit()
        return tokens

    async def logout(self, raw_refresh_token: str) -> None:
        session = await self.sessions.get_by_token_hash(hash_refresh_token(raw_refresh_token))
        if session is not None:
            await self.sessions.revoke(session)
            await self.db.commit()

    async def _issue_tokens(self, user: User) -> TokenResponse:
        raw_refresh_token = generate_refresh_token()
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

        session = Session(
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(raw_refresh_token),
            expires_at=expires_at,
        )
        await self.sessions.add(session)  # flushes, so session.id is populated below

        access_token = create_access_token(str(user.id), session.id)
        return TokenResponse(access_token=access_token, refresh_token=raw_refresh_token)
