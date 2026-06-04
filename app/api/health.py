from fastapi import APIRouter

from app.errors import success


router = APIRouter()


@router.get("/health")
async def health():
    return success({"ok": True})
