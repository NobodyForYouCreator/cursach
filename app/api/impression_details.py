from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.common import dump, dump_many
from app.models import Impression, Purchase, Review, Route, User
from app.schemas import ImpressionRead, PurchaseRead, ReviewRead, RoutePointRead, RouteRead


async def dump_reviews_with_usernames(session: AsyncSession, reviews) -> list[dict[str, Any]]:
    user_ids = {review.user_id for review in reviews}
    usernames: dict[int, str] = {}
    if user_ids:
        rows = (await session.execute(select(User.id, User.username).where(User.id.in_(user_ids)))).all()
        usernames = dict(rows)
    items = []
    for review in reviews:
        data = dump(ReviewRead, review)
        data["username"] = usernames.get(review.user_id)
        items.append(data)
    return items


async def build_impression_detail(
    session: AsyncSession, impression: Impression, user: User | None
) -> dict[str, Any]:
    route = await session.scalar(
        select(Route).options(selectinload(Route.points)).where(Route.id == impression.route_id)
    )
    reviews = (
        await session.scalars(
            select(Review).where(Review.impression_id == impression.id).order_by(Review.created_at.desc())
        )
    ).all()
    purchase = None
    if user:
        purchase = await session.scalar(
            select(Purchase)
            .where(Purchase.user_id == user.id, Purchase.impression_id == impression.id)
            .order_by(Purchase.created_at.desc())
        )
    route_data = dump(RouteRead, route)
    route_data["points"] = dump_many(RoutePointRead, route.points)
    data = dump(ImpressionRead, impression)
    data["route"] = route_data
    data["reviews"] = await dump_reviews_with_usernames(session, reviews)
    data["purchase"] = dump(PurchaseRead, purchase) if purchase else None
    return data
