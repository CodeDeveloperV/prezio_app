import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.features.auth.repository import SessionRepository
from app.features.users.models import User
from app.features.users.repository import UserRepository

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise credentials_error from exc

    if payload.get("type") != "access":
        raise credentials_error

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if user_id is None or session_id is None:
        raise credentials_error

    # Checking the session row (not just the JWT signature/expiry) means logout takes
    # effect immediately instead of waiting out the access token's natural expiry.
    session = await SessionRepository(db).get_by_id(int(session_id))
    if session is None or not SessionRepository.is_valid(session):
        raise credentials_error

    user = await UserRepository(db).get_by_id(int(user_id))
    if user is None or not user.is_active:
        raise credentials_error

    return user


async def get_current_moderator(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_moderator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderator privileges required")
    return current_user
