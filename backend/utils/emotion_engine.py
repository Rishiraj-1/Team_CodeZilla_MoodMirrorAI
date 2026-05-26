"""
Emotion Intelligence Engine
---------------------------
Single fused entry point for emotion analysis.

Takes any subset of {text, voice (audio_base64), face (image_base64)},
plus the user's recent reading history, and produces ONE canonical reading:

  emotion, confidence, explanation
  metrics: stress_score, burnout_risk, emotional_volatility,
           cognitive_load, crisis_probability

The engine is the single source of truth. All other analyze endpoints
delegate to it.

Design notes:
- One Gemini call fuses all modalities + history. Cheaper, more coherent
  than running three siloed calls and trying to merge after.
- emotional_volatility is computed deterministically (stddev of recent
  stress scores) -- we don't ask Gemini to do basic statistics.
- Failures degrade gracefully; we always return a usable reading instead
  of bubbling 500s up to the dashboard.
- Persistence:
    readings/{uid}/{push_id}  -- canonical time-series for new features
    reports/{uid}/{push_id}   -- legacy shape for back-compat with the
                                 existing /api/reports/me consumers
"""
from __future__ import annotations

import base64
import json
import math
import os
import re
import statistics
from datetime import datetime
from typing import Any, Optional

import requests

from ..database import rt_db
from . import crisis as crisis_engine


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")

CANONICAL_EMOTIONS = ["Happy", "Calm", "Neutral", "Sad", "Anxious", "Angry"]

# How many recent readings to pull as context for fusion + volatility.
HISTORY_WINDOW = 14


# ---------------------------------------------------------------------------
# JSON / text utilities (small, local copies so we don't depend on ai_client)
# ---------------------------------------------------------------------------

def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = "\n".join(s.splitlines()[1:])
    if s.endswith("```"):
        s = "\n".join(s.splitlines()[:-1])
    return s.strip()


def _find_json_block(s: str) -> Optional[str]:
    s = _strip_code_fences(s)
    m = re.search(r"\{[\s\S]*\}", s)
    return m.group(0) if m else None


def _extract_candidate_text(api_json: dict) -> str:
    try:
        candidates = api_json.get("candidates", [])
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        return "\n".join(
            [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
        )
    except Exception:
        return ""


def _normalize_emotion(raw: Optional[str]) -> str:
    if not raw:
        return "Neutral"
    t = str(raw).strip().lower()
    mapping = {
        "happy": "Happy", "joy": "Happy", "joyful": "Happy", "elated": "Happy",
        "calm": "Calm", "relaxed": "Calm", "content": "Calm",
        "neutral": "Neutral",
        "sad": "Sad", "sadness": "Sad", "down": "Sad", "depressed": "Sad",
        "anxious": "Anxious", "anxiety": "Anxious", "worried": "Anxious",
        "stressed": "Anxious", "fear": "Anxious",
        "angry": "Angry", "anger": "Angry", "frustrated": "Angry", "irritated": "Angry",
    }
    for k, v in mapping.items():
        if k in t:
            return v
    return "Neutral"


def _clamp(v: Any, lo: float = 0.0, hi: float = 100.0, default: float = 0.0) -> float:
    try:
        f = float(v)
    except Exception:
        return default
    if math.isnan(f):
        return default
    return max(lo, min(hi, f))


def _clamp_unit(v: Any, default: float = 0.5) -> float:
    return _clamp(v, 0.0, 1.0, default=default)


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def _load_history(uid: str, limit: int = HISTORY_WINDOW) -> list[dict]:
    """Most-recent-first list of past canonical readings for `uid`."""
    try:
        ref = rt_db.reference(f"readings/{uid}")
        data = ref.get()
    except Exception as e:
        print(f"[engine] history read failed: {e}")
        return []
    if not data:
        return []
    items = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        v = {**v, "id": k}
        items.append(v)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items[:limit]


def _recent_stress_series(history: list[dict]) -> list[float]:
    out = []
    for r in history:
        m = r.get("metrics") or {}
        s = m.get("stress_score")
        if isinstance(s, (int, float)):
            out.append(float(s))
    return out


def _compute_volatility(stress_series: list[float]) -> float:
    """Deterministic 0..100 volatility = scaled stddev of recent stress.

    Formula: stddev(0..100 series) typically lands in 0..50 even for very
    erratic users; we scale by 2 and clamp to 100.
    """
    if len(stress_series) < 2:
        return 0.0
    try:
        s = statistics.pstdev(stress_series)
    except statistics.StatisticsError:
        return 0.0
    return _clamp(s * 2.0, 0.0, 100.0, default=0.0)


def _summarize_history_for_prompt(history: list[dict]) -> str:
    if not history:
        return "No prior readings."
    lines = []
    for r in history[:8]:  # cap tokens
        m = r.get("metrics") or {}
        lines.append(
            f"- {r.get('created_at', '')[:16]} | "
            f"emotion={r.get('emotion', '?')} "
            f"stress={int(m.get('stress_score', 0))} "
            f"crisis={int(m.get('crisis_probability', 0))}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Gemini fusion call
# ---------------------------------------------------------------------------

_FUSION_SYSTEM_PROMPT = """You are MoodMirror's Emotion Intelligence Engine.

You receive any combination of: a short user-written text, a voice clip,
and a face image. You also receive a brief summary of the user's recent
emotional history.

Fuse all available signals into ONE coherent emotional assessment.
Treat history as soft context (recent trend), not ground truth -- the
current inputs dominate.

Return STRICT JSON only, no prose, no markdown. Schema:

{
  "emotion": one of ["Happy","Calm","Neutral","Sad","Anxious","Angry"],
  "confidence": number 0..1,
  "explanation": short string (<= 200 chars, plain text, no quotes),
  "metrics": {
    "stress_score":        integer 0..100,
    "burnout_risk":        integer 0..100,
    "cognitive_load":      integer 0..100,
    "crisis_probability":  integer 0..100
  }
}

Scoring guidance:
- stress_score:        acute stress signals in current inputs.
- burnout_risk:        sustained stress pattern (use history for this).
- cognitive_load:      mental fatigue, scattered thinking, low focus.
- crisis_probability:  presence of self-harm, hopelessness, or
                       imminent-danger language; default 0 unless real
                       indicators are present. Do NOT inflate.

Be conservative on crisis_probability. False alarms erode trust."""


def _build_gemini_parts(
    *,
    text: Optional[str],
    audio_base64: Optional[str],
    image_base64: Optional[str],
    history_summary: str,
) -> list[dict]:
    parts: list[dict] = [{"text": _FUSION_SYSTEM_PROMPT}]

    parts.append({"text": f"\n--- RECENT HISTORY ---\n{history_summary}"})

    if text and text.strip():
        parts.append({"text": f"\n--- USER TEXT ---\n{text.strip()}"})

    if audio_base64:
        parts.append(
            {
                "inlineData": {
                    "mimeType": "audio/wav",
                    "data": audio_base64,
                }
            }
        )
        parts.append({"text": "(The above is the user's voice clip. Read its tone, pace, hesitation.)"})

    if image_base64:
        parts.append(
            {
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": image_base64,
                }
            }
        )
        parts.append({"text": "(The above is the user's face. Read expression, eye contact, posture.)"})

    if not (text or audio_base64 or image_base64):
        parts.append({"text": "\n(No inputs provided. Return Neutral with low confidence.)"})

    return parts


def _call_gemini(parts: list[dict]) -> dict:
    if not API_KEY:
        return {"_error": "GOOGLE_API_KEY not configured"}

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "generationConfig": {
            "temperature": 0.2,
            "response_mime_type": "application/json",
        },
        "contents": [{"role": "user", "parts": parts}],
    }
    try:
        res = requests.post(url, json=payload, timeout=30)
    except Exception as e:
        return {"_error": f"gemini request failed: {e}"}

    if res.status_code != 200:
        return {"_error": f"gemini http {res.status_code}: {res.text[:200]}"}

    return res.json()


def _parse_fusion_json(api_json: dict) -> Optional[dict]:
    raw = _extract_candidate_text(api_json)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        block = _find_json_block(raw)
        if not block:
            return None
        try:
            return json.loads(block)
        except Exception:
            return None


# ---------------------------------------------------------------------------
# Heuristic fallback
# ---------------------------------------------------------------------------

_NEGATIVE_KEYWORDS = {
    "sad", "anxious", "anxiety", "stressed", "overwhelmed", "tired",
    "exhausted", "depressed", "hopeless", "worthless", "alone", "lonely",
    "scared", "afraid", "angry", "frustrated", "panic",
}

_CRISIS_KEYWORDS = {
    "suicide", "kill myself", "end it all", "self harm", "hurt myself",
    "no reason to live", "don't want to live", "want to die",
}


def _heuristic_reading(text: Optional[str]) -> dict:
    """Last-resort reading when Gemini is unavailable.

    We don't fabricate metrics from thin air; we look at the text only and
    score conservatively. Voice/face without Gemini = Neutral.
    """
    t = (text or "").lower()
    crisis_hit = any(k in t for k in _CRISIS_KEYWORDS)
    neg_hits = sum(1 for k in _NEGATIVE_KEYWORDS if k in t)

    if crisis_hit:
        emotion = "Sad"
        stress = 80
        crisis = 75
    elif neg_hits >= 2:
        emotion = "Anxious"
        stress = 60
        crisis = 10
    elif neg_hits == 1:
        emotion = "Sad"
        stress = 45
        crisis = 5
    elif t.strip():
        emotion = "Neutral"
        stress = 25
        crisis = 0
    else:
        emotion = "Neutral"
        stress = 20
        crisis = 0

    return {
        "emotion": emotion,
        "confidence": 0.45,
        "explanation": "Heuristic fallback; AI service unavailable.",
        "metrics": {
            "stress_score": stress,
            "burnout_risk": min(100, stress + 5),
            "cognitive_load": stress,
            "crisis_probability": crisis,
        },
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def analyze(
    uid: str,
    *,
    text: Optional[str] = None,
    audio_base64: Optional[str] = None,
    image_base64: Optional[str] = None,
    persist: bool = True,
) -> dict:
    """Run the engine and return a canonical reading dict.

    Returns shape (top-level):
      {
        "reading_id":  str (None if persist=False),
        "source":      "Text" | "Voice" | "Face" | "Multimodal",
        "emotion":     str,
        "confidence":  float 0..1,
        "explanation": str,
        "metrics": {
          "stress_score":         int,
          "burnout_risk":         int,
          "emotional_volatility": int,
          "cognitive_load":       int,
          "crisis_probability":   int,
        },
        "inputs": {"has_text": bool, "has_voice": bool, "has_face": bool},
        "created_at": iso8601 str,
        # Back-compat for existing frontend callers that read .analysis.*
        "analysis": {"emotion": ..., "confidence": ...},
      }
    """
    has_text = bool(text and text.strip())
    has_voice = bool(audio_base64)
    has_face = bool(image_base64)

    sources_count = sum([has_text, has_voice, has_face])
    if sources_count == 0:
        source = "Text"  # benign default
    elif sources_count > 1:
        source = "Multimodal"
    elif has_text:
        source = "Text"
    elif has_voice:
        source = "Voice"
    else:
        source = "Face"

    history = _load_history(uid)
    history_summary = _summarize_history_for_prompt(history)
    stress_series = _recent_stress_series(history)

    # ---- Gemini fusion ----
    parts = _build_gemini_parts(
        text=text,
        audio_base64=audio_base64,
        image_base64=image_base64,
        history_summary=history_summary,
    )
    api = _call_gemini(parts)

    if "_error" in api:
        print(f"[engine] gemini error -> falling back: {api['_error']}")
        parsed = _heuristic_reading(text)
    else:
        parsed = _parse_fusion_json(api) or _heuristic_reading(text)

    # ---- Normalize + sanitize ----
    emotion = _normalize_emotion(parsed.get("emotion"))
    confidence = _clamp_unit(parsed.get("confidence"), default=0.5)
    explanation = str(parsed.get("explanation") or "").strip()[:400]

    raw_metrics = parsed.get("metrics") or {}
    metrics = {
        "stress_score":        int(_clamp(raw_metrics.get("stress_score"))),
        "burnout_risk":        int(_clamp(raw_metrics.get("burnout_risk"))),
        "cognitive_load":      int(_clamp(raw_metrics.get("cognitive_load"))),
        "crisis_probability":  int(_clamp(raw_metrics.get("crisis_probability"))),
    }

    # Volatility computed from history + this reading's stress score
    series_with_now = stress_series + [float(metrics["stress_score"])]
    metrics["emotional_volatility"] = int(_compute_volatility(series_with_now))

    # ---- Crisis assessment ----
    # We classify on the user's text only (audio/face are non-textual to
    # the deterministic layer). The model layer in crisis.py also reads
    # readings as soft context, so signals from voice/face still count
    # via metrics.crisis_probability.
    try:
        crisis = crisis_engine.classify(text or "", history)
    except Exception as e:
        print(f"[engine] crisis.classify failed: {e}")
        crisis = {"level": "none", "probability": 0, "reasons": [], "triggered_by": "none"}

    # If the deterministic crisis_probability metric is high, raise the
    # crisis level even when no keywords/model fired -- e.g. Gemini-vision
    # picked up real distress in a face/voice clip.
    if crisis["level"] == "none" and metrics["crisis_probability"] >= 60:
        crisis["level"] = "elevated"
        crisis["probability"] = max(crisis["probability"], metrics["crisis_probability"])
        crisis["reasons"].append(
            f"engine crisis_probability={metrics['crisis_probability']}/100"
        )
        crisis["triggered_by"] = "metrics"

    reading = {
        "source": source,
        "emotion": emotion,
        "confidence": confidence,
        "explanation": explanation,
        "metrics": metrics,
        "crisis": crisis,
        "inputs": {
            "has_text": has_text,
            "has_voice": has_voice,
            "has_face": has_face,
        },
        "created_at": datetime.utcnow().isoformat(),
    }

    # ---- Persist ----
    reading_id: Optional[str] = None
    if persist:
        try:
            new_ref = rt_db.reference(f"readings/{uid}").push(reading)
            reading_id = new_ref.key
        except Exception as e:
            print(f"[engine] readings persist failed: {e}")

        # Legacy mirror so existing /api/reports/me keeps working unchanged.
        try:
            legacy = {
                "source": source,
                "text": text if has_text else None,
                "analysis": {
                    "emotion": emotion,
                    "confidence": confidence,
                    "explanation": explanation,
                    "metrics": metrics,
                },
                "created_at": reading["created_at"],
            }
            rt_db.reference(f"reports/{uid}").push(legacy)
        except Exception as e:
            print(f"[engine] legacy reports persist failed: {e}")

        # Log crisis event when level >= watch.
        try:
            crisis_engine.log_event(
                uid,
                assessment=crisis,
                source="engine",
                trigger_excerpt=(text or "")[:200] if has_text else f"[{source} input]",
            )
        except Exception as e:
            print(f"[engine] crisis log failed: {e}")

    response = {
        "reading_id": reading_id,
        **reading,
        # Top-level convenience for frontend (avoids reaching into .crisis.level)
        "crisis_level": crisis["level"],
        # Back-compat for existing callers (TextInput, AudioCapture)
        "analysis": {
            "emotion": emotion,
            "confidence": confidence,
            "explanation": explanation,
            "metrics": metrics,
        },
    }
    return response
