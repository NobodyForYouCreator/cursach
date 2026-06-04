from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.common import PositiveId, commit_refresh, dump, dump_many
from app.deps import AdminUser, CurrentUser, OptionalUser, SessionDep
from app.errors import ApiError, success
from app.models import Route, RoutePoint
from app.schemas import ModerationReject, RouteCreate, RoutePointCreate, RoutePointRead, RoutePointUpdate, RouteRead, RouteUpdate
from app.services import (
    apply_sort,
    assert_owner_or_admin,
    create_event,
    ensure_route_editable,
    ensure_route_has_points,
    paginate,
    route_city_match,
    route_has_any_impression,
    route_has_published_impression,
    route_visible,
    validate_cities,
)


router = APIRouter()


@router.post("/routes")
async def create_route(payload: RouteCreate, user: CurrentUser, session: SessionDep):
    cities = validate_cities([city.model_dump() for city in payload.cities])
    route = Route(
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        cities=cities,
        duration_minutes=payload.duration_minutes,
        status="draft",
    )
    session.add(route)
    await session.flush()
    await create_event(session, "route_created", "route", route.id, user.id)
    await session.commit()
    await session.refresh(route)
    return success(dump(RouteRead, route))


@router.get("/routes")
async def list_routes(
    session: SessionDep,
    user: OptionalUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    external_city_id: str | None = None,
    author_id: Annotated[int | None, Query(gt=0)] = None,
    sort_by: str = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    stmt = select(Route)
    if user and user.role == "admin":
        if author_id:
            stmt = stmt.where(Route.user_id == author_id)
    elif author_id and user and author_id == user.id:
        stmt = stmt.where(Route.user_id == user.id)
    else:
        if user:
            stmt = stmt.where(or_(Route.status == "published", Route.user_id == user.id))
        else:
            stmt = stmt.where(Route.status == "published")
        if author_id:
            stmt = stmt.where(Route.user_id == author_id)
    stmt = apply_sort(stmt, Route, sort_by, sort_order, {"created_at", "updated_at", "name"})
    if external_city_id:
        all_items = (await session.scalars(stmt)).all()
        filtered = [route for route in all_items if route_city_match(route, external_city_id)]
        start = (page - 1) * page_size
        items = filtered[start : start + page_size]
        total = len(filtered)
    else:
        result = await paginate(session, stmt, page, page_size)
        items = result["items"]
        total = result["total"]
    return success(
        {
            "items": dump_many(RouteRead, items),
            "page": page,
            "page_size": page_size,
            "total": total,
        }
    )


@router.get("/routes/{route_id}")
async def get_route(route_id: PositiveId, session: SessionDep, user: OptionalUser):
    route = await session.scalar(
        select(Route).options(selectinload(Route.points)).where(Route.id == route_id)
    )
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if not route_visible(route, user):
        raise ApiError(403, "Доступ запрещён")
    data = dump(RouteRead, route)
    data["points"] = dump_many(RoutePointRead, route.points)
    return success(data)


@router.patch("/routes/{route_id}")
async def update_route(route_id: PositiveId, payload: RouteUpdate, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    assert_owner_or_admin(route.user_id, user)
    await ensure_route_editable(session, route)
    patch = payload.model_dump(exclude_unset=True)
    if not patch:
        return success(dump(RouteRead, route))
    if "cities" in patch:
        patch["cities"] = validate_cities([city.model_dump() for city in payload.cities or []])
    for field, value in patch.items():
        setattr(route, field, value)
    if route.status in {"published", "rejected"}:
        route.status = "draft"
        route.moderation_comment = None
    await commit_refresh(session, route)
    return success(dump(RouteRead, route))


@router.delete("/routes/{route_id}")
async def delete_route(route_id: PositiveId, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    assert_owner_or_admin(route.user_id, user)
    if await route_has_published_impression(session, route.id):
        raise ApiError(409, "Маршрут нельзя удалить, потому что у него есть опубликованные впечатления")
    if route.status == "draft" and not await route_has_any_impression(session, route.id):
        await session.delete(route)
    else:
        route.status = "archived"
    await session.commit()
    return success({"deleted": True})


@router.post("/routes/{route_id}/submit")
async def submit_route(route_id: PositiveId, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if route.user_id != user.id:
        raise ApiError(403, "Отправить маршрут на модерацию может только его владелец")
    if route.status not in {"draft", "rejected"}:
        raise ApiError(409, "Маршрут нельзя отправить на модерацию из текущего статуса")
    await ensure_route_has_points(session, route.id)
    route.status = "published" if user.role in {"author", "admin"} else "on_moderation"
    route.moderation_comment = None
    await commit_refresh(session, route)
    return success(dump(RouteRead, route))


@router.get("/moderation/routes")
async def moderation_routes(admin: AdminUser, session: SessionDep):
    routes = (await session.scalars(select(Route).where(Route.status == "on_moderation"))).all()
    return success(dump_many(RouteRead, routes))


@router.post("/moderation/routes/{route_id}/publish")
async def publish_route(route_id: PositiveId, admin: AdminUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if route.status != "on_moderation":
        raise ApiError(409, "Маршрут можно опубликовать только из статуса on_moderation")
    await ensure_route_has_points(session, route.id)
    route.status = "published"
    route.moderation_comment = None
    await commit_refresh(session, route)
    return success(dump(RouteRead, route))


@router.post("/moderation/routes/{route_id}/reject")
async def reject_route(route_id: PositiveId, payload: ModerationReject, admin: AdminUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if route.status != "on_moderation":
        raise ApiError(409, "Маршрут можно отклонить только из статуса on_moderation")
    route.status = "rejected"
    route.moderation_comment = payload.moderation_comment
    await commit_refresh(session, route)
    return success(dump(RouteRead, route))


@router.post("/routes/{route_id}/points")
async def create_point(route_id: PositiveId, payload: RoutePointCreate, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    assert_owner_or_admin(route.user_id, user)
    await ensure_route_editable(session, route)
    count = await session.scalar(select(func.count(RoutePoint.id)).where(RoutePoint.route_id == route_id))
    if count and count >= 100:
        raise ApiError(409, "Маршрут не может содержать больше 100 точек")
    exists = await session.scalar(
        select(RoutePoint.id).where(RoutePoint.route_id == route_id, RoutePoint.point_order == payload.point_order)
    )
    if exists:
        raise ApiError(409, "point_order точки должен быть уникальным внутри маршрута")
    point = RoutePoint(route_id=route_id, **payload.model_dump())
    session.add(point)
    try:
        await commit_refresh(session, point)
    except IntegrityError:
        await session.rollback()
        raise ApiError(409, "point_order точки должен быть уникальным внутри маршрута")
    return success(dump(RoutePointRead, point))


@router.get("/routes/{route_id}/points")
async def list_points(route_id: PositiveId, session: SessionDep, user: OptionalUser):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if not route_visible(route, user):
        raise ApiError(403, "Доступ запрещён")
    points = (
        await session.scalars(
            select(RoutePoint).where(RoutePoint.route_id == route_id).order_by(RoutePoint.point_order.asc())
        )
    ).all()
    return success(dump_many(RoutePointRead, points))


@router.patch("/routes/{route_id}/points/{point_id}")
async def update_point(
    route_id: PositiveId, point_id: PositiveId, payload: RoutePointUpdate, user: CurrentUser, session: SessionDep
):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    assert_owner_or_admin(route.user_id, user)
    await ensure_route_editable(session, route)
    point = await session.scalar(select(RoutePoint).where(RoutePoint.id == point_id, RoutePoint.route_id == route_id))
    if not point:
        raise ApiError(404, "Точка маршрута не найдена")
    patch = payload.model_dump(exclude_unset=True)
    if "point_order" in patch:
        exists = await session.scalar(
            select(RoutePoint.id).where(
                RoutePoint.route_id == route_id,
                RoutePoint.point_order == patch["point_order"],
                RoutePoint.id != point_id,
            )
        )
        if exists:
            raise ApiError(409, "point_order точки должен быть уникальным внутри маршрута")
    for field, value in patch.items():
        setattr(point, field, value)
    try:
        await commit_refresh(session, point)
    except IntegrityError:
        await session.rollback()
        raise ApiError(409, "point_order точки должен быть уникальным внутри маршрута")
    return success(dump(RoutePointRead, point))


@router.delete("/routes/{route_id}/points/{point_id}")
async def delete_point(route_id: PositiveId, point_id: PositiveId, user: CurrentUser, session: SessionDep):
    route = await session.get(Route, route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    assert_owner_or_admin(route.user_id, user)
    await ensure_route_editable(session, route)
    point = await session.scalar(select(RoutePoint).where(RoutePoint.id == point_id, RoutePoint.route_id == route_id))
    if not point:
        raise ApiError(404, "Точка маршрута не найдена")
    await session.delete(point)
    await session.flush()
    points = (
        await session.scalars(
            select(RoutePoint).where(RoutePoint.route_id == route_id).order_by(RoutePoint.point_order.asc())
        )
    ).all()
    for index, item in enumerate(points, start=1):
        item.point_order = index
    await session.commit()
    return success({"deleted": True})
