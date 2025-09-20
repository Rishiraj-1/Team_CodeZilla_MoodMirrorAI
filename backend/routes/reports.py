from fastapi import APIRouter, Depends
from ..utils.firebase_auth import get_current_user
from ..database import rt_db

router = APIRouter(prefix="/api/reports")


@router.get("/me")
def get_my_reports(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    ref = rt_db.reference(f"reports/{uid}")
    data = ref.get()
    if not data:
        return []
    reports = [{"id": k, **v} for k, v in data.items()]
    reports.sort(key=lambda x: x["created_at"], reverse=True)
    return reports


