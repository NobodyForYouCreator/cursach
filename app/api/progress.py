from fastapi import APIRouter, WebSocket
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.common import PositiveId, commit_refresh, dump
from app.db import SessionLocal
from app.deps import CurrentUser, SessionDep, user_from_websocket
from app.errors import ApiError, error_payload, success
from app.models import Impression, Progress, Route
from app.schemas import CoordinateMessage, ProgressRead
from app.services import can_start_impression, create_event, haversine_meters


router = APIRouter()


@router.get("/progress/{impression_id}")
async def get_progress(impression_id: PositiveId, user: CurrentUser, session: SessionDep):
    impression = await session.get(Impression, impression_id)
    if not impression:
        raise ApiError(404, "Впечатление не найдено")
    if not await can_start_impression(session, user, impression):
        raise ApiError(403, "Пользователь не может начать это впечатление")
    progress = await session.scalar(
        select(Progress).where(Progress.user_id == user.id, Progress.impression_id == impression_id)
    )
    if not progress:
        progress = Progress(user_id=user.id, impression_id=impression_id, current_point=0, is_completed=False)
        session.add(progress)
        await commit_refresh(session, progress)
    return success(dump(ProgressRead, progress))


@router.websocket("/ws/{impression_id}")
async def websocket_progress(impression_id: PositiveId, websocket: WebSocket):
    await websocket.accept()
    async with SessionLocal() as session:
        try:
            token = websocket.query_params.get("token")
            user = await user_from_websocket(websocket, session, token)
            impression = await session.scalar(
                select(Impression)
                .options(selectinload(Impression.route).selectinload(Route.points))
                .where(Impression.id == impression_id)
            )
            if not impression:
                raise ApiError(404, "Впечатление не найдено")
            if not await can_start_impression(session, user, impression):
                raise ApiError(403, "Пользователь не может начать это впечатление")
            while True:
                raw = await websocket.receive_json()
                try:
                    coords = CoordinateMessage.model_validate(raw)
                except Exception:
                    await websocket.send_json(error_payload(422, "Ошибка валидации"))
                    continue
                progress = await session.scalar(
                    select(Progress).where(
                        Progress.user_id == user.id,
                        Progress.impression_id == impression_id,
                    )
                )
                if progress is None:
                    progress = Progress(user_id=user.id, impression_id=impression_id)
                    session.add(progress)
                    await session.flush()
                if progress.is_completed:
                    progress.current_point = 0
                    progress.is_completed = False
                    progress.started_event_sent = False
                if not progress.started_event_sent:
                    await create_event(session, "impression_started", "impression", impression.id, user.id)
                    progress.started_event_sent = True
                points = sorted(impression.route.points, key=lambda p: p.point_order)
                reached = False
                distance = None
                next_index = progress.current_point
                if next_index < len(points):
                    point = points[next_index]
                    distance = haversine_meters(coords.latitude, coords.longitude, point.latitude, point.longitude)
                    if distance <= 30:
                        reached = True
                        progress.current_point += 1
                        if progress.current_point >= len(points):
                            progress.is_completed = True
                            await create_event(
                                session, "impression_completed", "impression", impression.id, user.id
                            )
                await session.commit()
                await session.refresh(progress)
                await websocket.send_json(
                    success(
                        {
                            "progress": dump(ProgressRead, progress),
                            "point_reached": reached,
                            "distance_meters": round(distance, 2) if distance is not None else None,
                        }
                    )
                )
        except ApiError as exc:
            await websocket.send_json(error_payload(exc.status_code, exc.detail["message"]))
            await websocket.close()
