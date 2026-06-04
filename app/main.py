from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from sqlalchemy import or_, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import (
    analytics,
    auth,
    bff,
    health,
    impressions,
    places,
    progress,
    purchases,
    recommendations,
    reviews,
    routes,
    users,
    showcase,
)
from app.config import get_settings
from app.db import SessionLocal, engine
from app.errors import (
    ApiError,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.models import Base, User
from app.security import hash_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.app_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        exists = await session.scalar(
            select(User.id).where(
                or_(User.email == settings.admin_email, User.username == settings.admin_username)
            )
        )
        if exists is None:
            admin = User(
                username=settings.admin_username,
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                role="admin",
            )
            session.add(admin)
            await session.commit()
    yield


app = FastAPI(title="Travel backend", version="beta", lifespan=lifespan)
app.add_exception_handler(ApiError, http_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, tags=["Service status"])
app.include_router(auth.router, tags=["Authentication"])
app.include_router(users.router, tags=["Users and administration"])
app.include_router(routes.router, tags=["Routes"])
app.include_router(impressions.router, tags=["Impressions"])
app.include_router(showcase.router, tags=["Showcase"])
app.include_router(purchases.router, tags=["Purchases"])
app.include_router(reviews.router, tags=["Reviews"])
app.include_router(recommendations.router, tags=["Recommendations"])
app.include_router(progress.router, tags=["Progress"])
app.include_router(analytics.router, tags=["Analytics"])
app.include_router(bff.router, tags=["BFF"])
app.include_router(places.router, tags=["Places"])
