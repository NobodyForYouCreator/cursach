from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.common import PositiveId, dump, dump_many
from app.api.impression_details import build_impression_detail
from app.deps import OptionalUser, SessionDep
from app.errors import ApiError, success
from app.models import Impression, Route
from app.schemas import ImpressionRead
from app.services import create_event, impression_visible, route_city_match


router = APIRouter()


@router.get("/bff/impressions/{impression_id}")
async def bff_impression(impression_id: PositiveId, session: SessionDep, user: OptionalUser):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if not impression_visible(impression, user):
        raise ApiError(403, "Доступ запрещён")
    if impression.status == "published":
        await create_event(
            session, "impression_viewed", "impression", impression.id, user.id if user else None, {"source": "bff"}
        )
        await session.commit()
        await session.refresh(impression)
    return success(await build_impression_detail(session, impression, user))


@router.get("/bff/home")
async def bff_home(
    session: SessionDep,
    user: OptionalUser,
    city_external_id: str | None = None,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
):
    showcase_stmt = (
        select(Impression)
        .join(Route)
        .where(Impression.status == "published")
        .order_by(Impression.popularity_score.desc(), Impression.rating.desc())
        .limit(page_size)
    )
    showcase = (await session.scalars(showcase_stmt)).all()
    if city_external_id:
        route_ids = {item.route_id for item in showcase}
        routes = (await session.scalars(select(Route).where(Route.id.in_(route_ids)))).all() if route_ids else []
        allowed = {route.id for route in routes if route_city_match(route, city_external_id)}
        showcase = [item for item in showcase if item.route_id in allowed]
    recs = []
    if user:
        for item in showcase:
            data = dump(ImpressionRead, item)
            data["score"] = round(item.rating * 2 + item.popularity_score, 2)
            recs.append(data)
        recs.sort(key=lambda x: (x["score"], x["rating"], x["popularity_score"]), reverse=True)
    return success({"showcase": dump_many(ImpressionRead, showcase), "recommendations": recs})
