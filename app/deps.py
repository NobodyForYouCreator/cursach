from typing import Annotated

import jwt
from fastapi import Depends, Query, WebSocket
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.models import User
from app.security import decode_access_token


SessionDep = Annotated[AsyncSession, Depends(get_session)]
bearer_scheme = HTTPBearer(auto_error=False)


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    token = credentials.credentials if credentials else None
    if not token:
        raise ApiError(401, "Токен доступа не передан")
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, KeyError, ValueError):
        raise ApiError(401, "Токен доступа некорректен или истёк")
    user = await session.get(User, user_id)
    if not user:
        raise ApiError(401, "Некорректный токен доступа")
    if user.is_blocked:
        raise ApiError(403, "Пользователь заблокирован")
    return user


async def get_optional_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User | None:
    token = credentials.credentials if credentials else None
    if not token:
        return None
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    user = await session.get(User, user_id)
    if not user or user.is_blocked:
        return None
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise ApiError(403, "Требуется роль администратора")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


async def user_from_websocket(
    websocket: WebSocket, session: AsyncSession, token: str | None = Query(default=None)
) -> User:
    auth = websocket.headers.get("authorization")
    bearer = _extract_bearer(auth) or token
    if not bearer:
        raise ApiError(403, "Токен доступа не передан")
    try:
        user_id = decode_access_token(bearer)
    except (jwt.PyJWTError, KeyError, ValueError):
        raise ApiError(403, "Токен доступа некорректен или истёк")
    user = await session.scalar(select(User).where(User.id == user_id))
    if not user or user.is_blocked:
        raise ApiError(403, "Доступ запрещён")
    return user
