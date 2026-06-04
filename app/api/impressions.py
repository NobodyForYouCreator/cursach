from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.common import PositiveId, commit_refresh, dump, dump_many
from app.api.impression_details import build_impression_detail
from app.deps import AdminUser, CurrentUser, OptionalUser, SessionDep
from app.errors import ApiError, success
from app.models import Impression, Route
from app.schemas import ImpressionCreate, ImpressionRead, ImpressionUpdate, ModerationReject
from app.services import (
    apply_sort,
    assert_owner_or_admin,
    create_event,
    ensure_impression_route_published,
    impression_visible,
    paginate,
)


router = APIRouter()


@router.post("/impressions")
async def create_impression(payload: ImpressionCreate, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, payload.route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if user.role != "admin" and route.user_id != user.id and route.status != "published":
        raise ApiError(403, "Маршрут недоступен для создания впечатления")
    impression = Impression(
        route_id=payload.route_id,
        author_id=user.id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        status="draft",
    )
    session.add(impression)
    await commit_refresh(session, impression)
    return success(dump(ImpressionRead, impression))


@router.get("/impressions")
async def list_impressions(
    session: SessionDep,
    user: OptionalUser,
    scope: Literal["public", "own", "all"] = "public",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    sort_by: str = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    stmt = select(Impression)
    if scope == "public":
        stmt = stmt.where(Impression.status == "published")
    elif scope == "own":
        if not user:
            raise ApiError(401, "Требуется авторизация")
        stmt = stmt.where(Impression.author_id == user.id)
    elif scope == "all":
        if not user or user.role != "admin":
            raise ApiError(403, "Требуется роль администратора")
    stmt = apply_sort(stmt, Impression, sort_by, sort_order, {"created_at", "updated_at", "status"})
    result = await paginate(session, stmt, page, page_size)
    return success(
        {
            "items": dump_many(ImpressionRead, result["items"]),
            "page": page,
            "page_size": page_size,
            "total": result["total"],
        }
    )



@router.get("/impressions/{impression_id}")
async def get_impression(impression_id: PositiveId, session: SessionDep, user: OptionalUser):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if not impression_visible(impression, user):
        raise ApiError(403, "Доступ запрещён")
    if impression.status == "published":
        await create_event(
            session, "impression_viewed", "impression", impression.id, user.id if user else None, {"source": "api"}
        )
        await session.commit()
        await session.refresh(impression)
    return success(await build_impression_detail(session, impression, user))


@router.patch("/impressions/{impression_id}")
async def update_impression(
    impression_id: PositiveId, payload: ImpressionUpdate, user: CurrentUser, session: SessionDep
):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    assert_owner_or_admin(impression.author_id, user)
    patch = payload.model_dump(exclude_unset=True)
    if not patch:
        return success(dump(ImpressionRead, impression))
    if "route_id" in patch:
        route = await session.get(Route, patch["route_id"])
        if not route:
            raise ApiError(404, "Маршрут не найден")
        if user.role != "admin" and route.user_id != user.id and route.status != "published":
            raise ApiError(403, "Маршрут недоступен для создания впечатления")
    for field, value in patch.items():
        setattr(impression, field, value)
    if impression.status in {"published", "rejected"}:
        impression.status = "draft"
        impression.moderation_comment = None
    await commit_refresh(session, impression)
    return success(dump(ImpressionRead, impression))


@router.post("/impressions/{impression_id}/submit")
async def submit_impression(impression_id: PositiveId, user: CurrentUser, session: SessionDep):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if impression.author_id != user.id:
        raise ApiError(403, "Отправить впечатление на модерацию может только его владелец")
    if impression.status not in {"draft", "rejected"}:
        raise ApiError(409, "Впечатление нельзя отправить на модерацию из текущего статуса")
    await ensure_impression_route_published(session, impression)
    impression.status = "published" if user.role in {"author", "admin"} else "on_moderation"
    impression.moderation_comment = None
    await commit_refresh(session, impression)
    return success(dump(ImpressionRead, impression))


@router.delete("/impressions/{impression_id}")
async def delete_impression(impression_id: PositiveId, user: CurrentUser, session: SessionDep):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    assert_owner_or_admin(impression.author_id, user)
    if impression.status == "draft":
        await session.delete(impression)
    else:
        impression.status = "archived"
    await session.commit()
    return success({"deleted": True})


@router.get("/moderation/impressions")
async def moderation_impressions(admin: AdminUser, session: SessionDep):
    impressions = (await session.scalars(select(Impression).where(Impression.status == "on_moderation"))).all()
    return success(dump_many(ImpressionRead, impressions))


@router.post("/moderation/impressions/{impression_id}/publish")
async def publish_impression(impression_id: PositiveId, admin: AdminUser, session: SessionDep):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if impression.status != "on_moderation":
        raise ApiError(409, "Впечатление можно опубликовать только из статуса on_moderation")
    await ensure_impression_route_published(session, impression)
    impression.status = "published"
    impression.moderation_comment = None
    await session.flush()
    await create_event(session, "impression_published", "impression", impression.id, admin.id)
    await session.commit()
    await session.refresh(impression)
    return success(dump(ImpressionRead, impression))


@router.post("/moderation/impressions/{impression_id}/reject")
async def reject_impression(
    impression_id: PositiveId, payload: ModerationReject, admin: AdminUser, session: SessionDep
):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if impression.status != "on_moderation":
        raise ApiError(409, "Впечатление можно отклонить только из статуса on_moderation")
    impression.status = "rejected"
    impression.moderation_comment = payload.moderation_comment
    await commit_refresh(session, impression)
    return success(dump(ImpressionRead, impression))
