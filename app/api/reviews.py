from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.common import PositiveId, dump, dump_many
from app.deps import CurrentUser, OptionalUser, SessionDep
from app.errors import ApiError, success
from app.models import Impression, Progress, Review
from app.schemas import ReviewCreate, ReviewRead
from app.services import impression_visible, paginate, recalc_rating


router = APIRouter()


@router.post("/impressions/{impression_id}/reviews")
async def create_review(
    impression_id: PositiveId, payload: ReviewCreate, user: CurrentUser, session: SessionDep
):
    impression = await session.get(Impression, impression_id)
    if not impression or impression.status != "published":
        raise ApiError(404, "Опубликованное впечатление не найдено")
    progress = await session.scalar(
        select(Progress).where(
            Progress.user_id == user.id,
            Progress.impression_id == impression_id,
            Progress.is_completed.is_(True),
        )
    )
    if not progress:
        raise ApiError(403, "Отзыв можно оставить только после завершения впечатления")
    review = Review(user_id=user.id, impression_id=impression_id, rating=payload.rating, comment=payload.comment)
    session.add(review)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ApiError(409, "Пользователь уже оставил отзыв на это впечатление")
    await recalc_rating(session, impression_id)
    await session.commit()
    await session.refresh(review)
    return success(dump(ReviewRead, review))


@router.get("/impressions/{impression_id}/reviews")
async def list_reviews(
    impression_id: PositiveId,
    session: SessionDep,
    user: OptionalUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if not impression_visible(impression, user):
        raise ApiError(403, "Доступ запрещён")
    stmt = select(Review).where(Review.impression_id == impression_id).order_by(Review.created_at.desc())
    result = await paginate(session, stmt, page, page_size)
    return success(
        {
            "items": dump_many(ReviewRead, result["items"]),
            "page": page,
            "page_size": page_size,
            "total": result["total"],
        }
    )
