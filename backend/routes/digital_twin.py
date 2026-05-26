"""
/api/digital_twin routes.

GET /me        -- the rich profile + insights from the Twin engine
GET /forecast  -- legacy endpoint kept for back-compat; returns the
                  forecast slice extracted from the new engine output.
"""
from fastapi import APIRouter, Depends

from ..utils.firebase_auth import get_current_user
from ..utils import digital_twin as twin_engine

router = APIRouter(prefix="/api/digital_twin")


@router.get("/me")
def my_twin(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    return twin_engine.get_twin(uid)


@router.get("/forecast")
def mood_forecast(decoded=Depends(get_current_user)):
    """Legacy shape: { uid, forecast: [{day, mood}], total_reports }.

    We populate it from the new Twin output so old callers keep working.
    """
    uid = decoded["uid"]
    twin = twin_engine.get_twin(uid)
    profile = twin.get("profile") or {}
    insights = twin.get("insights") or {}

    forecast_items = []
    for f in (insights.get("forecast") or []):
        # Map risk levels to legacy mood-ish words for back-compat.
        risk_to_mood = {"low": "stable", "medium": "watchful", "high": "elevated"}
        forecast_items.append(
            {
                "day": f.get("day_offset", 0) + 1,
                "mood": risk_to_mood.get(f.get("risk", "low"), "stable"),
            }
        )

    if not forecast_items:
        forecast_items = [{"day": i, "mood": "stable"} for i in range(1, 8)]

    return {
        "uid": uid,
        "forecast": forecast_items,
        "total_reports": profile.get("n_readings", 0),
    }
