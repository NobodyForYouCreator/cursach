from fastapi import APIRouter

from app.api.common import PositiveId, commit_refresh, dump
from app.deps import AdminUser, CurrentUser, SessionDep
from app.errors import ApiError, success
from app.models import User
from app.schemas import BlockUserIn, UserRead


router = APIRouter()


@router.get("/users/me")
async def me(user: CurrentUser):
    return success(dump(UserRead, user))


@router.patch("/admin/users/{user_id}/block")
async def block_user(user_id: PositiveId, payload: BlockUserIn, admin: AdminUser, session: SessionDep):
    user = await session.get(User, user_id)
    if not user:
        raise ApiError(404, "Пользователь не найден")
    user.is_blocked = payload.is_blocked
    await commit_refresh(session, user)
    return success(dump(UserRead, user))


@router.patch("/admin/users/{user_id}/verify-author")
async def verify_author(user_id: PositiveId, admin: AdminUser, session: SessionDep):
    user = await session.get(User, user_id)
    if not user:
        raise ApiError(404, "Пользователь не найден")
    user.role = "author"
    await commit_refresh(session, user)
    return success(dump(UserRead, user))
