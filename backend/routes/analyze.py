from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from ..utils.firebase_auth import get_current_user
from ..utils.ai_client import analyze_text_with_gemini, generate_suggestion_with_gemini, analyze_voice_with_gemini
from ..database import rt_db
from datetime import datetime
import json

router = APIRouter(prefix="/api/analyze")


class TextRequest(BaseModel):
    text: str


class VoiceAnalyzeRequest(BaseModel):
    user_id: str
    audio_base64: str


@router.post("/text")
async def analyze_text(req: TextRequest, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    print(f"[Backend] Received text for analysis: {req.text}")
    if not req.text.strip():
        raise HTTPException(400, "Text required")

    result = analyze_text_with_gemini(req.text)
    if "error" in result:
        print(f"[Backend] Error from Gemini text analysis: {result["error"]}")
        raise HTTPException(500, f"AI text analysis failed: {result["error"]}")

    suggestion = generate_suggestion_with_gemini(req.text)
    if "error" in suggestion:
        print(f"[Backend] Error from Gemini suggestion generation: {suggestion["error"]}")
        raise HTTPException(500, f"AI suggestion generation failed: {suggestion["error"]}")

    report_ref = rt_db.reference(f"reports/{uid}")
    new_ref = report_ref.push({
        "source": "Text",
        "text": req.text,
        "analysis": result,
        "suggestion": suggestion,
        "created_at": datetime.utcnow().isoformat(),
    })

    # Normalize top-level for frontend convenience
    response = {
        "report_id": new_ref.key,
        "analysis": result,
        "suggestion": suggestion,
    }
    if isinstance(result, dict):
        if "emotion" in result:
            response["emotion"] = result.get("emotion")
        if "confidence" in result:
            response["confidence"] = result.get("confidence")
    return response


@router.post("/voice")
async def analyze_voice(request: Request, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    print(f"[Backend] Received voice for analysis.")
    try:
        body = await request.json()
        print(f"[Backend] Voice request body keys: {list(body.keys())}")
        
        if not body.get("audio_base64", "").strip():
            raise HTTPException(status_code=400, detail="audio_base64 required")

        result = analyze_voice_with_gemini(body["audio_base64"])
        print(f"[Backend] Voice analysis result: {result}")
        
        if "error" in result:
            print(f"[Backend] Error from Gemini voice analysis: {result['error']}")
            raise HTTPException(500, f"AI voice analysis failed: {result['error']}")

        # Generate coping suggestions for voice analysis
        suggestion = generate_suggestion_with_gemini("Voice analysis showing emotional state")
        if "error" in suggestion:
            print(f"[Backend] Error from Gemini suggestion generation: {suggestion['error']}")
            suggestion = {"text": "Consider taking a moment to reflect on your current emotional state."}

        # Save to reports database
        report_ref = rt_db.reference(f"reports/{uid}")
        new_ref = report_ref.push({
            "source": "Voice",
            "analysis": result,
            "suggestion": suggestion,
            "created_at": datetime.utcnow().isoformat(),
        })

        # Normalize top-level for frontend convenience
        response = {
            "report_id": new_ref.key,
            "analysis": result,
            "suggestion": suggestion,
        }
        if isinstance(result, dict):
            if "emotion" in result:
                response["emotion"] = result.get("emotion")
            if "confidence" in result:
                response["confidence"] = result.get("confidence")
        return response
    except Exception as e:
        print(f"[Backend] Error in voice analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


