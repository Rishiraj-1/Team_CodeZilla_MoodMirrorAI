"""
/api/crisis routes.

Wellbeing-summary endpoint feeds the 'Tell someone' flow.
Recent-events endpoint feeds the upcoming Reports / Twin views.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..utils.firebase_auth import get_current_user
from ..utils import crisis as crisis_engine
from ..utils import personalization as pers_engine

router = APIRouter(prefix="/api/crisis")


class LogPayload(BaseModel):
    level: str
    reasons: list[str] = []
    source: str = "manual"
    trigger_excerpt: Optional[str] = None


@router.get("/wellbeing-summary")
async def wellbeing_summary(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    text = crisis_engine.generate_wellbeing_summary(uid)
    return {"message": text}


@router.get("/recent")
async def recent(decoded=Depends(get_current_user), limit: int = 10):
    uid = decoded["uid"]
    return {"events": crisis_engine.recent_events(uid, limit=max(1, min(limit, 50)))}


@router.post("/log")
async def log(payload: LogPayload, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    if payload.level not in ("none", "watch", "elevated", "crisis"):
        raise HTTPException(400, "Invalid level")
    eid = crisis_engine.log_event(
        uid,
        assessment={
            "level": payload.level,
            "probability": 0,
            "reasons": payload.reasons,
            "triggered_by": "manual",
        },
        source=payload.source,
        trigger_excerpt=payload.trigger_excerpt,
    )
    return {"event_id": eid}


@router.get("/helplines")
async def helplines(decoded=Depends(get_current_user)):
    """Region-aware helpline list, picked from the user's personalization
    profile (culture + language). Always includes a global pointer.
    """
    uid = decoded["uid"]
    profile = pers_engine.get_profile(uid)
    return {"helplines": pers_engine.regional_helplines(profile)}
