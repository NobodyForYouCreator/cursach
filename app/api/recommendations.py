from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.common import dump
from app.deps import CurrentUser, SessionDep
from app.errors import ApiError, success
from app.models import Impression, Route
from app.schemas import ImpressionRead
from app.services import nearest_city_id, route_city_match


router = APIRouter()


@router.get("/recommendations")
async def recommendations(
    user: CurrentUser,
    session: SessionDep,
    city_external_id: str | None = None,
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    min_duration: int | None = Query(default=None, ge=1),
    max_duration: int | None = Query(default=None, ge=1),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    sort_by: str = "score",
):
    if min_price is not None and max_price is not None and min_price > max_price:
        raise ApiError(422, "min_price не может быть больше max_price")
    if min_duration is not None and max_duration is not None and min_duration > max_duration:
        raise ApiError(422, "min_duration не может быть больше max_duration")
    if sort_by not in {"score", "rating", "popularity_score"}:
        raise ApiError(422, f"Неподдерживаемое значение sort_by: {sort_by}")
    selected_city = city_external_id
    has_lat = latitude is not None
    has_lon = longitude is not None
    if has_lat != has_lon:
        raise ApiError(422, "Необходимо передать latitude и longitude вместе")
    if selected_city is None and has_lat and has_lon:
        selected_city = nearest_city_id(latitude, longitude)
    if selected_city is None:
        raise ApiError(422, "Необходимо передать city_external_id или координаты")
    stmt = select(Impression).join(Route).where(Impression.status == "published")
    if min_price is not None:
        stmt = stmt.where(Impression.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Impression.price <= max_price)
    if min_duration is not None:
        stmt = stmt.where(Route.duration_minutes >= min_duration)
    if max_duration is not None:
        stmt = stmt.where(Route.duration_minutes <= max_duration)
    impressions = (await session.scalars(stmt.options(selectinload(Impression.route)))).all()
    rows = []
    for item in impressions:
        if not route_city_match(item.route, selected_city):
            continue
        score = round(item.rating * 2 + item.popularity_score, 2)
        data = dump(ImpressionRead, item)
        data["score"] = score
        rows.append(data)
    rows.sort(key=lambda x: (x[sort_by], x["rating"], x["popularity_score"]), reverse=True)
    start = (page - 1) * page_size
    return success({"items": rows[start : start + page_size], "page": page, "page_size": page_size, "total": len(rows)})
