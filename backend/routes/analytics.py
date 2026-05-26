"""
/api/analytics routes.

Thin HTTP layer over utils.analytics. Deterministic numbers only --
no Gemini in here.
"""
from fastapi import APIRouter, Depends

from ..utils.firebase_auth import get_current_user
from ..utils import analytics as analytics_engine

router = APIRouter(prefix="/api/analytics")


@router.get("/me")
def my_analytics(decoded=Depends(get_current_user), days: int = 28):
    uid = decoded["uid"]
    return analytics_engine.get_analytics(uid, days=days)
