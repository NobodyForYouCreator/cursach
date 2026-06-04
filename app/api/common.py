from typing import Annotated

from fastapi import Path
from sqlalchemy.ext.asyncio import AsyncSession


PositiveId = Annotated[int, Path(gt=0)]


def dump(schema, obj):
    return schema.model_validate(obj).model_dump(mode="json")


def dump_many(schema, items):
    return [dump(schema, item) for item in items]


async def commit_refresh(session: AsyncSession, obj):
    await session.commit()
    await session.refresh(obj)
    return obj
