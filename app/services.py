import math
from datetime import datetime
from typing import Iterable

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import AnalyticsEvent, Impression, Progress, Purchase, Review, Route, RoutePoint, User


KNOWN_CITIES = {
    "msk": {"external_city_id": "msk", "name": "Москва", "latitude": 55.7558, "longitude": 37.6173},
    "spb": {"external_city_id": "spb", "name": "Санкт-Петербург", "latitude": 59.9391, "longitude": 30.3159},
    "kzn": {"external_city_id": "kzn", "name": "Казань", "latitude": 55.7963, "longitude": 49.1088},
    "ekb": {"external_city_id": "ekb", "name": "Екатеринбург", "latitude": 56.8389, "longitude": 60.6057},
    "nsk": {"external_city_id": "nsk", "name": "Новосибирск", "latitude": 55.0084, "longitude": 82.9357},
    "kgd": {"external_city_id": "kgd", "name": "Калининград", "latitude": 54.7104, "longitude": 20.4522},
    "12345": {"external_city_id": "12345", "name": "Москва"},
}

POPULARITY_EVENTS = {
    "impression_viewed": 1,
    "impression_started": 3,
    "purchase_paid": 5,
    "impression_completed": 4,
}


def page_bounds(page: int, page_size: int) -> tuple[int, int]:
    return (page - 1) * page_size, page_size


async def paginate(session: AsyncSession, stmt: Select, page: int, page_size: int):
    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = await session.scalar(total_stmt)
    offset, limit = page_bounds(page, page_size)
    items = (await session.scalars(stmt.offset(offset).limit(limit))).all()
    return {"items": items, "page": page, "page_size": page_size, "total": total or 0}


async def route_point_count(session: AsyncSession, route_id: int) -> int:
    return await session.scalar(select(func.count(RoutePoint.id)).where(RoutePoint.route_id == route_id)) or 0


async def ensure_route_has_points(session: AsyncSession, route_id: int):
    if await route_point_count(session, route_id) == 0:
        raise ApiError(409, "Маршрут должен содержать хотя бы одну точку")


async def ensure_impression_route_published(session: AsyncSession, impression: Impression):
    route = await session.get(Route, impression.route_id)
    if not route:
        raise ApiError(404, "Маршрут не найден")
    if route.status != "published":
        raise ApiError(409, "Маршрут впечатления должен быть опубликован")


def assert_owner_or_admin(obj_user_id: int, user: User):
    if user.role != "admin" and obj_user_id != user.id:
        raise ApiError(403, "Доступ запрещён")


def validate_cities(cities: list[dict]) -> list[dict[str, str]]:
    normalized = []
    seen = set()
    for city in cities:
        external_id = city["external_city_id"]
        if external_id not in KNOWN_CITIES:
            raise ApiError(422, f"Неизвестный external_city_id города: {external_id}")
        if external_id in seen:
            raise ApiError(422, "external_city_id города не должен повторяться")
        seen.add(external_id)
        provider_city = KNOWN_CITIES[external_id]
        normalized.append(
            {
                "external_city_id": provider_city["external_city_id"],
                "name": provider_city["name"],
            }
        )
    return normalized


def route_visible(route: Route, user: User | None) -> bool:
    if route.status == "published":
        return True
    if user is None:
        return False
    return user.role == "admin" or route.user_id == user.id


def impression_visible(impression: Impression, user: User | None) -> bool:
    if impression.status == "published":
        return True
    if user is None:
        return False
    return user.role == "admin" or impression.author_id == user.id


async def route_has_published_impression(session: AsyncSession, route_id: int) -> bool:
    count = await session.scalar(
        select(func.count(Impression.id)).where(
            Impression.route_id == route_id, Impression.status == "published"
        )
    )
    return bool(count)


async def route_has_any_impression(session: AsyncSession, route_id: int) -> bool:
    count = await session.scalar(select(func.count(Impression.id)).where(Impression.route_id == route_id))
    return bool(count)


async def ensure_route_editable(session: AsyncSession, route: Route):
    if await route_has_published_impression(session, route.id):
        raise ApiError(409, "Маршрут нельзя изменить, потому что у него есть опубликованные впечатления")


async def create_event(
    session: AsyncSession,
    event_type: str,
    entity_type: str,
    entity_id: int,
    user_id: int | None = None,
    metadata: dict | None = None,
) -> AnalyticsEvent:
    event = AnalyticsEvent(
        user_id=user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        event_metadata=metadata or {},
    )
    session.add(event)
    await session.flush()
    if event_type in POPULARITY_EVENTS and entity_type == "impression":
        await recalc_popularity(session, entity_id)
    return event


async def recalc_rating(session: AsyncSession, impression_id: int):
    rating = await session.scalar(select(func.avg(Review.rating)).where(Review.impression_id == impression_id))
    impression = await session.get(Impression, impression_id)
    if impression:
        impression.rating = round(float(rating or 0), 2)


async def recalc_popularity(session: AsyncSession, impression_id: int):
    rows = (
        await session.execute(
            select(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id))
            .where(
                AnalyticsEvent.entity_type == "impression",
                AnalyticsEvent.entity_id == impression_id,
                AnalyticsEvent.event_type.in_(POPULARITY_EVENTS.keys()),
            )
            .group_by(AnalyticsEvent.event_type)
        )
    ).all()
    raw = sum(POPULARITY_EVENTS[event_type] * count for event_type, count in rows)
    impression = await session.get(Impression, impression_id)
    if impression:
        impression.popularity_score = round(min(10, raw / 10), 2)


async def can_start_impression(session: AsyncSession, user: User, impression: Impression) -> bool:
    if impression.status != "published":
        return False
    if user.role == "admin" or impression.author_id == user.id or float(impression.price) == 0:
        return True
    paid = await session.scalar(
        select(Purchase.id).where(
            Purchase.user_id == user.id,
            Purchase.impression_id == impression.id,
            Purchase.status == "paid",
        )
    )
    return paid is not None


async def get_or_create_progress(session: AsyncSession, user_id: int, impression_id: int) -> Progress:
    progress = await session.scalar(
        select(Progress).where(Progress.user_id == user_id, Progress.impression_id == impression_id)
    )
    if progress is None:
        progress = Progress(user_id=user_id, impression_id=impression_id, current_point=0, is_completed=False)
        session.add(progress)
        await session.flush()
    return progress


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_city_id(latitude: float, longitude: float) -> str | None:
    best_id = None
    best_distance = None
    for city in KNOWN_CITIES.values():
        city_lat = city.get("latitude")
        city_lon = city.get("longitude")
        if city_lat is None or city_lon is None:
            continue
        distance = haversine_meters(latitude, longitude, city_lat, city_lon)
        if best_distance is None or distance < best_distance:
            best_id = city["external_city_id"]
            best_distance = distance
    return best_id


def filter_by_city(stmt: Select, city_external_id: str | None) -> Select:
    if not city_external_id:
        return stmt
    return stmt.where(Route.cities.contains([{"external_city_id": city_external_id, "name": KNOWN_CITIES.get(city_external_id, {}).get("name", "")}]))


def route_city_match(route: Route, city_external_id: str | None) -> bool:
    if not city_external_id:
        return True
    return any(city.get("external_city_id") == city_external_id for city in route.cities)


def apply_sort(stmt: Select, model, sort_by: str, sort_order: str, allowed: Iterable[str]) -> Select:
    if sort_by not in allowed:
        raise ApiError(422, f"Неподдерживаемое значение sort_by: {sort_by}")
    column = getattr(model, sort_by)
    return stmt.order_by(column.desc() if sort_order == "desc" else column.asc())
