"""
/api/mirror routes.

Thin HTTP layer on top of utils.mirror.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..utils.firebase_auth import get_current_user
from ..utils import mirror as mirror_engine

router = APIRouter(prefix="/api/mirror")


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
async def chat(req: ChatRequest, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    if not req.message or not req.message.strip():
        raise HTTPException(400, "Message required")
    try:
        return mirror_engine.chat(uid, req.message)
    except Exception as e:
        print(f"[mirror route] chat raised: {e}")
        raise HTTPException(500, f"Mirror failed: {e}")


@router.get("/history")
async def history(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    msgs = mirror_engine.get_history(uid)
    # Strip db ids -- frontend doesn't need them.
    return {
        "messages": [
            {
                "role": m.get("role"),
                "text": m.get("text"),
                "created_at": m.get("created_at"),
            }
            for m in msgs
        ]
    }


@router.post("/reset")
async def reset(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    ok = mirror_engine.reset(uid)
    if not ok:
        raise HTTPException(500, "Could not reset session")
    return {"ok": True}
