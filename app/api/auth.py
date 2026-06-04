from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.deps import SessionDep
from app.errors import ApiError, success
from app.models import User
from app.schemas import AuthLogin, AuthRegister, TokenRead
from app.security import create_access_token, hash_password, verify_password


router = APIRouter()


@router.post("/auth/register")
async def register(payload: AuthRegister, session: SessionDep):
    existing = await session.scalar(
        select(User).where(or_(User.username == payload.username, User.email == str(payload.email)))
    )
    if existing:
        field = "username" if existing.username == payload.username else "email"
        field_name = "именем пользователя" if field == "username" else "email"
        raise ApiError(409, f"Пользователь с таким {field_name} уже существует")
    user = User(
        username=payload.username,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        role="user",
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ApiError(409, "Пользователь с таким именем пользователя или email уже существует")
    await session.refresh(user)
    token = TokenRead(
        access_token=create_access_token(user.id),
        user_id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
    )
    return success(token.model_dump(mode="json"))


@router.post("/auth/login")
async def login(payload: AuthLogin, session: SessionDep):
    user = await session.scalar(
        select(User).where(or_(User.email == payload.login, User.username == payload.login))
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise ApiError(401, "Неверный логин или пароль")
    if user.is_blocked:
        raise ApiError(403, "Пользователь заблокирован")
    token = TokenRead(
        access_token=create_access_token(user.id),
        user_id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
    )
    return success(token.model_dump(mode="json"))
