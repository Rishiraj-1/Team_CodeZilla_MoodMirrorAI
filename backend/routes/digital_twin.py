from fastapi import APIRouter, Depends
from ..utils.firebase_auth import get_current_user
from ..database import rt_db
import datetime

router = APIRouter(prefix="/api/digital_twin")


@router.get("/forecast")
def mood_forecast(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    reports = rt_db.reference(f"reports/{uid}").get() or {}

    # dummy forecast logic for now
    forecast = [{"day": i, "mood": "stable"} for i in range(1, 8)]
    return {"uid": uid, "forecast": forecast, "total_reports": len(reports)}


