"""
/api/privacy routes.

Owns the user-facing privacy controls:
  - GET  /consent          read current toggle state
  - PUT  /consent          update toggles (whitelisted keys only)
  - GET  /transparency     last N readings with their reasoning
  - GET  /export           full JSON dump of user-owned paths
  - POST /delete-all       irrevocable wipe; requires explicit
                           confirm: "DELETE" in the body
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..utils.firebase_auth import get_current_user
from ..utils import privacy as privacy_engine

router = APIRouter(prefix="/api/privacy")


class ConsentPatch(BaseModel):
    allow_text: Optional[bool] = None
    allow_voice: Optional[bool] = None
    allow_face: Optional[bool] = None
    allow_text_storage: Optional[bool] = None
    allow_mirror_history: Optional[bool] = None
    allow_crisis_log: Optional[bool] = None


class DeleteRequest(BaseModel):
    confirm: str  # must equal "DELETE"


@router.get("/consent")
def get_consent(decoded=Depends(get_current_user)):
    return privacy_engine.get_consent(decoded["uid"])


@router.put("/consent")
def update_consent(patch: ConsentPatch, decoded=Depends(get_current_user)):
    body: dict[str, Any] = {k: v for k, v in patch.model_dump().items() if v is not None}
    return privacy_engine.set_consent(decoded["uid"], body)


@router.get("/transparency")
def transparency(decoded=Depends(get_current_user), limit: int = 20):
    uid = decoded["uid"]
    return {"items": privacy_engine.transparency_log(uid, limit=limit)}


@router.get("/export")
def export_data(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    bundle = privacy_engine.export_all(uid)
    return JSONResponse(
        content=bundle,
        headers={
            "Content-Disposition": f'attachment; filename="moodmirror-export-{uid}.json"',
        },
    )


@router.post("/delete-all")
def delete_all(req: DeleteRequest, decoded=Depends(get_current_user)):
    if req.confirm != "DELETE":
        raise HTTPException(400, "Confirmation token mismatch; expected 'DELETE'.")
    return privacy_engine.delete_all_user_data(decoded["uid"])
