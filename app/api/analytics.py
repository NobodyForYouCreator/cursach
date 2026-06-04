from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.common import dump_many
from app.deps import AdminUser, SessionDep
from app.errors import ApiError, success
from app.models import AnalyticsEvent
from app.schemas import AnalyticsEventRead, AnalyticsSummary


router = APIRouter()


@router.get("/analytics/events")
async def analytics_events(
    admin: AdminUser,
    session: SessionDep,
    event_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise ApiError(422, "date_from не может быть больше date_to")
    stmt = select(AnalyticsEvent).order_by(AnalyticsEvent.timestamp.desc())
    if event_type:
        stmt = stmt.where(AnalyticsEvent.event_type == event_type)
    if date_from:
        stmt = stmt.where(AnalyticsEvent.timestamp >= date_from)
    if date_to:
        stmt = stmt.where(AnalyticsEvent.timestamp <= date_to)
    events = (await session.scalars(stmt)).all()
    return success(dump_many(AnalyticsEventRead, events))


@router.get("/analytics/summary")
async def analytics_summary(
    admin: AdminUser,
    session: SessionDep,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise ApiError(422, "date_from не может быть больше date_to")
    stmt = select(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id)).group_by(AnalyticsEvent.event_type)
    if date_from:
        stmt = stmt.where(AnalyticsEvent.timestamp >= date_from)
    if date_to:
        stmt = stmt.where(AnalyticsEvent.timestamp <= date_to)
    rows = (await session.execute(stmt)).all()
    by_type = {event_type: count for event_type, count in rows}
    data = AnalyticsSummary(total=sum(by_type.values()), by_event_type=by_type)
    return success(data.model_dump(mode="json"))
