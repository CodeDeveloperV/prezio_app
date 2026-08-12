from datetime import datetime, timezone

from sqlalchemy import select

from app.features.auth.models import Session
from app.shared.base_repository import BaseRepository


class SessionRepository(BaseRepository[Session]):
    model = Session

    async def get_by_token_hash(self, token_hash: str) -> Session | None:
        result = await self.session.execute(
            select(Session).where(Session.refresh_token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def revoke(self, session: Session) -> None:
        session.revoked_at = datetime.now(timezone.utc)
        await self.session.flush()

    @staticmethod
    def is_valid(session: Session) -> bool:
        now = datetime.now(timezone.utc)
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return session.revoked_at is None and expires_at > now
