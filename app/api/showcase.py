from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.common import PositiveId, dump_many
from app.api.impression_details import build_impression_detail
from app.deps import SessionDep
from app.errors import ApiError, success
from app.models import Impression, Route
from app.schemas import ImpressionRead
from app.services import apply_sort, create_event, paginate, route_city_match


router = APIRouter()


@router.get("/showcase/impressions")
async def showcase_impressions(
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    city_external_id: str | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    min_duration: int | None = Query(default=None, ge=1),
    max_duration: int | None = Query(default=None, ge=1),
    sort_by: str = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    if min_price is not None and max_price is not None and min_price > max_price:
        raise ApiError(422, "min_price не может быть больше max_price")
    if min_duration is not None and max_duration is not None and min_duration > max_duration:
        raise ApiError(422, "min_duration не может быть больше max_duration")
    stmt = select(Impression).join(Route).where(Impression.status == "published")
    if min_price is not None:
        stmt = stmt.where(Impression.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Impression.price <= max_price)
    if min_duration is not None:
        stmt = stmt.where(Route.duration_minutes >= min_duration)
    if max_duration is not None:
        stmt = stmt.where(Route.duration_minutes <= max_duration)
    stmt = apply_sort(stmt, Impression, sort_by, sort_order, {"price", "rating", "popularity_score", "created_at"})
    if city_external_id:
        all_items = (await session.scalars(stmt)).all()
        route_ids = {item.route_id for item in all_items}
        routes = (await session.scalars(select(Route).where(Route.id.in_(route_ids)))).all() if route_ids else []
        allowed = {route.id for route in routes if route_city_match(route, city_external_id)}
        filtered = [item for item in all_items if item.route_id in allowed]
        start = (page - 1) * page_size
        items = filtered[start : start + page_size]
        total = len(filtered)
    else:
        result = await paginate(session, stmt, page, page_size)
        items = result["items"]
        total = result["total"]
    return success({"items": dump_many(ImpressionRead, items), "page": page, "page_size": page_size, "total": total})


@router.get("/showcase/cities")
async def showcase_cities(session: SessionDep):
    routes = (
        await session.scalars(
            select(Route)
            .join(Impression, Impression.route_id == Route.id)
            .where(Impression.status == "published")
        )
    ).all()
    cities: dict[str, str] = {}
    seen_routes: set[int] = set()
    for route in routes:
        if route.id in seen_routes:
            continue
        seen_routes.add(route.id)
        for city in route.cities:
            cities[city["external_city_id"]] = city["name"]
    items = [{"external_city_id": cid, "name": name} for cid, name in cities.items()]
    items.sort(key=lambda c: c["name"])
    return success(items)


@router.get("/showcase/impressions/{impression_id}")
async def showcase_impression(impression_id: PositiveId, session: SessionDep):
    impression = await session.get(Impression, impression_id)
    if not impression or impression.status != "published":
        raise ApiError(404, "Опубликованное впечатление не найдено")
    await create_event(session, "impression_viewed", "impression", impression.id, None, {"source": "showcase"})
    await session.commit()
    await session.refresh(impression)
    return success(await build_impression_detail(session, impression, None))
