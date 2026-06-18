from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.common import PositiveId, dump
from app.deps import CurrentUser, SessionDep
from app.errors import ApiError, success
from app.models import Impression, Purchase
from app.schemas import PaymentRequest, PurchaseCreate, PurchaseRead
from app.services import create_event


router = APIRouter()


@router.post("/purchases")
async def create_purchase(payload: PurchaseCreate, user: CurrentUser, session: SessionDep):
    impression = await session.get(Impression, payload.impression_id)
    if not impression or impression.status != "published":
        raise ApiError(404, "Опубликованное впечатление не найдено")
    paid = await session.scalar(
        select(Purchase.id).where(
            Purchase.user_id == user.id,
            Purchase.impression_id == impression.id,
        )
    )
    if paid:
        raise ApiError(409, "У пользователя уже есть покупка этого впечатления")
    purchase = Purchase(
        user_id=user.id,
        impression_id=impression.id,
        status="created",
        price_at_purchase=impression.price,
    )
    session.add(purchase)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ApiError(409, "У пользователя уже есть покупка этого впечатления")
    await create_event(session, "purchase_created", "purchase", purchase.id, user.id)
    await session.commit()
    await session.refresh(purchase)
    return success(dump(PurchaseRead, purchase))


@router.post("/purchases/{purchase_id}/pay")
async def pay_purchase(
    purchase_id: PositiveId, payload: PaymentRequest, user: CurrentUser, session: SessionDep
):
    purchase = await session.get(Purchase, purchase_id)
    if not purchase:
        raise ApiError(404, "Покупка не найдена")
    if purchase.user_id != user.id:
        raise ApiError(403, "Доступ запрещён")
    if purchase.status == "paid":
        return success(dump(PurchaseRead, purchase))
    purchase.status = "paid" if payload.success else "failed"
    await session.flush()
    if purchase.status == "paid":
        await create_event(
            session,
            "purchase_paid",
            "impression",
            purchase.impression_id,
            user.id,
            {"purchase_id": purchase.id},
        )
    await session.commit()
    await session.refresh(purchase)
    return success(dump(PurchaseRead, purchase))


@router.get("/purchases/my")
async def my_purchases(user: CurrentUser, session: SessionDep):
    rows = (
        await session.execute(
            select(Purchase, Impression.name)
            .join(Impression, Impression.id == Purchase.impression_id)
            .where(Purchase.user_id == user.id)
            .order_by(Purchase.created_at.desc())
        )
    ).all()
    items = []
    for purchase, impression_name in rows:
        data = dump(PurchaseRead, purchase)
        data["impression_name"] = impression_name
        items.append(data)
    return success(items)
