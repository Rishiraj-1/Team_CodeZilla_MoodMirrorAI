"""
/api/analyze routes.

The unified POST /api/analyze is the new front door. It accepts any
subset of {text, audio_base64, image_base64} and runs the Emotion
Intelligence Engine.

The legacy /text, /voice, /face routes are kept as thin wrappers that
delegate to the engine, so existing frontend callers don't break.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..utils.emotion_engine import analyze as engine_analyze
from ..utils.firebase_auth import get_current_user

router = APIRouter(prefix="/api/analyze")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UnifiedAnalyzeRequest(BaseModel):
    text: Optional[str] = None
    audio_base64: Optional[str] = None
    image_base64: Optional[str] = None


class TextRequest(BaseModel):
    text: str


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

@router.post("")
@router.post("/")
async def analyze_unified(
    req: UnifiedAnalyzeRequest,
    decoded=Depends(get_current_user),
):
    uid = decoded["uid"]

    if not (req.text or req.audio_base64 or req.image_base64):
        raise HTTPException(400, "Provide at least one of: text, audio_base64, image_base64")

    try:
        result = engine_analyze(
            uid,
            text=req.text,
            audio_base64=req.audio_base64,
            image_base64=req.image_base64,
        )
    except Exception as e:
        print(f"[analyze] engine raised: {e}")
        raise HTTPException(500, f"Emotion engine failed: {e}")

    # The engine already produces a frontend-friendly envelope; pass through.
    return result


# ---------------------------------------------------------------------------
# Legacy routes (delegate to the engine)
# ---------------------------------------------------------------------------

@router.post("/text")
async def analyze_text(req: TextRequest, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    if not req.text or not req.text.strip():
        raise HTTPException(400, "Text required")

    result = engine_analyze(uid, text=req.text)

    # Legacy callers expect a top-level `emotion` and `confidence`. The
    # engine already adds these via `analysis`, but older code paths read
    # both top-level and nested -- mirror them up explicitly to be safe.
    return {
        **result,
        "emotion": result.get("emotion"),
        "confidence": result.get("confidence"),
    }


@router.post("/voice")
async def analyze_voice(request: Request, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    audio_b64 = (body or {}).get("audio_base64", "")
    if not audio_b64 or not str(audio_b64).strip():
        raise HTTPException(400, "audio_base64 required")

    result = engine_analyze(uid, audio_base64=audio_b64)
    return {
        **result,
        "emotion": result.get("emotion"),
        "confidence": result.get("confidence"),
    }


@router.post("/face")
async def analyze_face(request: Request, decoded=Depends(get_current_user)):
    """New real face endpoint. Replaces the frontend stub.

    Body: { "image_base64": "<jpeg-base64-no-prefix>" }
    """
    uid = decoded["uid"]
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    image_b64 = (body or {}).get("image_base64", "")
    if not image_b64 or not str(image_b64).strip():
        raise HTTPException(400, "image_base64 required")

    result = engine_analyze(uid, image_base64=image_b64)
    return {
        **result,
        "emotion": result.get("emotion"),
        "confidence": result.get("confidence"),
    }
