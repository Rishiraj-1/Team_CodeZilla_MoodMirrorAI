"""
Mirror -- the Gemini-powered reflective companion.

Reads the user's recent emotion readings (populated by the Emotion
Intelligence Engine) and recent chat history, then has a multi-turn
conversation in the style of a peer-support listener with light CBT
scaffolding.

Design rules (encoded in the system prompt + this file):
  - Validate feelings before anything else.
  - One clarifying question at a time, not three.
  - Offer small, concrete reframes -- not lectures.
  - Reference the user's recent state lightly, like a friend who
    remembers, not like a chart-reading clinician.
  - Refuse diagnosis, prescriptions, legal advice.
  - On crisis language, prepend a brief safety message + helpline
    info. The full safety flow lives in the (separate) crisis module.

Persistence shape (Firebase Realtime DB):
  mirror_sessions/{uid}/messages/{push_id}:
    role: "user" | "model"
    text: str
    created_at: iso8601

A single rolling session per user. /reset clears it.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

import requests

from ..database import rt_db
from . import crisis as crisis_engine
from . import privacy as privacy_engine


API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")

# Token-budget knobs
MAX_HISTORY_TURNS = 12          # last N messages from the rolling session
MAX_READINGS = 6                # recent emotion readings used as context

# Words/phrases that flip Mirror into "safety-aware" mode for THIS turn.
# Conservative: we'd rather over-handle than miss it.
CRISIS_PHRASES = (
    "suicide",
    "kill myself",
    "kill my self",
    "end it all",
    "end my life",
    "not worth living",
    "no reason to live",
    "do not want to live",
    "don't want to live",
    "want to die",
    "hurt myself",
    "self harm",
    "self-harm",
    "cut myself",
)


SAFETY_PREFIX = (
    "I want to pause for a second -- what you said sounds heavy, and I "
    "want to make sure you have someone real to talk to right now. "
    "If you're in India, you can reach iCall on 9152987821, "
    "Vandrevala Foundation on 1860-2662-345, or AASRA on 9820466726, "
    "any time of day. I'm still here too -- "
)


SYSTEM_INSTRUCTION = """You are "Mirror", a calm, warm, reflective companion inside the
MoodMirrorAI app. You are NOT a therapist, NOT a doctor, and you do NOT
diagnose. You're like a thoughtful friend who has training in active
listening and a little CBT.

How you talk:
- Always validate feelings first, before anything else.
- Ask ONE clarifying question at a time, not three. Short questions.
- Use the user's words back to them when possible.
- When you offer a reframe, make it small and concrete (one breath
  exercise, one journaling prompt, one tiny experiment they could try
  in the next hour). No lectures.
- Keep replies short -- usually 2-5 sentences. Long replies feel
  clinical.
- If the user has shared their recent emotional state in the context
  block, reference it lightly, like a friend who remembers, not like a
  chart-reading clinician. Do not list their metrics back at them.
- Match the user's language. If they write in Hindi or Hinglish,
  reply in the same.

What you NEVER do:
- Never diagnose ("you have depression / anxiety / ADHD").
- Never give medical, legal, or financial advice.
- Never claim to be a real therapist.
- Never repeat the same phrase twice in a conversation.
- Never end with "I'm always here" type filler.

If the user expresses self-harm or suicidal intent, stay grounded,
acknowledge how painful what they shared sounds, and gently encourage
them to reach a human (helpline, trusted person). Do not panic, do not
lecture, do not minimize.
"""


# ---------------------------------------------------------------------------
# Context loaders
# ---------------------------------------------------------------------------

def _load_recent_readings(uid: str, limit: int = MAX_READINGS) -> list[dict]:
    try:
        data = rt_db.reference(f"readings/{uid}").get()
    except Exception as e:
        print(f"[mirror] readings load failed: {e}")
        return []
    if not data:
        return []
    items = []
    for k, v in data.items():
        if isinstance(v, dict):
            items.append({**v, "id": k})
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items[:limit]


def _load_recent_messages(uid: str, limit: int = MAX_HISTORY_TURNS) -> list[dict]:
    try:
        data = rt_db.reference(f"mirror_sessions/{uid}/messages").get()
    except Exception as e:
        print(f"[mirror] messages load failed: {e}")
        return []
    if not data:
        return []
    items = []
    for k, v in data.items():
        if isinstance(v, dict) and v.get("role") in ("user", "model") and v.get("text"):
            items.append({**v, "id": k})
    items.sort(key=lambda x: x.get("created_at", ""))
    # Keep last N. We want chronological order for the prompt.
    return items[-limit:]


def _summarize_readings_for_prompt(readings: list[dict]) -> str:
    """Compact, human-readable context block for the system prompt.

    We deliberately do NOT dump raw metrics; Mirror should use this
    softly, not robotically.
    """
    if not readings:
        return "No recent readings yet."
    latest = readings[0]
    m = latest.get("metrics") or {}
    lines = [
        f"Most recent reading ({latest.get('created_at', '')[:16]}): "
        f"{latest.get('emotion', 'Neutral')} "
        f"(stress {int(m.get('stress_score', 0))}/100, "
        f"crisis signal {int(m.get('crisis_probability', 0))}/100)."
    ]

    # Trend: count emotions in the window.
    counts: dict[str, int] = {}
    for r in readings:
        e = r.get("emotion") or "Neutral"
        counts[e] = counts.get(e, 0) + 1
    if counts:
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        trend = ", ".join(f"{e}\u00d7{n}" for e, n in top[:3])
        lines.append(f"Recent trend across last {len(readings)} readings: {trend}.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Crisis tripwire
# ---------------------------------------------------------------------------

def _has_crisis_signal(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return any(p in low for p in CRISIS_PHRASES)


# ---------------------------------------------------------------------------
# Gemini multi-turn call
# ---------------------------------------------------------------------------

def _build_contents(history: list[dict], user_message: str) -> list[dict]:
    """Build the `contents` array for Gemini in multi-turn shape."""
    contents = []
    for m in history:
        contents.append(
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [{"text": str(m.get("text", ""))}],
            }
        )
    contents.append({"role": "user", "parts": [{"text": user_message}]})
    return contents


def _call_gemini(system_text: str, contents: list[dict]) -> tuple[str, Optional[str]]:
    """Returns (reply_text, error_or_None)."""
    if not API_KEY:
        return ("", "GOOGLE_API_KEY not configured")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": system_text}]},
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 400,
        },
        "contents": contents,
    }
    try:
        res = requests.post(url, json=payload, timeout=30)
    except Exception as e:
        return ("", f"gemini request failed: {e}")

    if res.status_code != 200:
        return ("", f"gemini http {res.status_code}: {res.text[:200]}")

    data = res.json()
    try:
        candidates = data.get("candidates", [])
        if not candidates:
            return ("", "gemini returned no candidates")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "\n".join([p.get("text", "") for p in parts if isinstance(p, dict)]).strip()
        if not text:
            return ("", "gemini returned empty text")
        return (text, None)
    except Exception as e:
        return ("", f"gemini parse error: {e}")


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def _persist_message(uid: str, role: str, text: str) -> Optional[str]:
    # Honor privacy.allow_mirror_history: if off, the chat still runs
    # this turn but we do NOT persist messages. Future turns won't have
    # this conversation as context -- that's the user's explicit choice.
    try:
        if not privacy_engine.get_consent(uid).get("allow_mirror_history", True):
            return None
    except Exception as e:
        print(f"[mirror] consent check failed, persisting anyway: {e}")

    try:
        ref = rt_db.reference(f"mirror_sessions/{uid}/messages").push(
            {
                "role": role,
                "text": text,
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        return ref.key
    except Exception as e:
        print(f"[mirror] persist failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def get_history(uid: str, limit: int = MAX_HISTORY_TURNS) -> list[dict]:
    return _load_recent_messages(uid, limit=limit)


def reset(uid: str) -> bool:
    try:
        rt_db.reference(f"mirror_sessions/{uid}/messages").delete()
        return True
    except Exception as e:
        print(f"[mirror] reset failed: {e}")
        return False


def chat(uid: str, user_message: str) -> dict:
    """Run one turn. Persists both user + model messages.

    Returns:
      {
        "reply":         str,
        "user_msg_id":   str | None,
        "model_msg_id":  str | None,
        "crisis":        { level, probability, reasons, triggered_by },
        "crisis_flag":   bool,        # legacy: True iff level >= elevated
        "context_used":  {
          "readings_count": int,
          "history_count":  int,
          "latest_emotion": str | None,
        },
      }
    """
    user_message = (user_message or "").strip()
    if not user_message:
        return {
            "reply": "I'm here -- what's on your mind right now?",
            "user_msg_id": None,
            "model_msg_id": None,
            "crisis": {"level": "none", "probability": 0, "reasons": [], "triggered_by": "none"},
            "crisis_flag": False,
            "context_used": {"readings_count": 0, "history_count": 0, "latest_emotion": None},
        }

    # Load context first so the classifier can use it.
    readings = _load_recent_readings(uid)
    history = _load_recent_messages(uid)

    # Central crisis classification (keyword + history + optional model).
    try:
        crisis = crisis_engine.classify(user_message, readings)
    except Exception as e:
        print(f"[mirror] crisis.classify failed: {e}")
        crisis = {"level": "none", "probability": 0, "reasons": [], "triggered_by": "none"}

    crisis_flag = crisis["level"] in ("elevated", "crisis")

    context_block = _summarize_readings_for_prompt(readings)

    system_text = (
        SYSTEM_INSTRUCTION
        + "\n\n--- USER CONTEXT (silent, do not echo) ---\n"
        + context_block
    )

    # Persist user message BEFORE the call so it's not lost if Gemini errors.
    user_msg_id = _persist_message(uid, "user", user_message)

    contents = _build_contents(history, user_message)
    reply_text, err = _call_gemini(system_text, contents)

    if err:
        print(f"[mirror] gemini error: {err}")
        # Soft, honest fallback. We do NOT pretend to be working.
        reply_text = (
            "I'm having trouble connecting to my words right now -- "
            "give me a moment and try again? I'm still here."
        )

    if crisis["level"] == "crisis":
        reply_text = SAFETY_PREFIX + reply_text

    model_msg_id = _persist_message(uid, "model", reply_text)

    # Log the crisis event (>=watch). Skipped automatically for 'none'.
    try:
        crisis_engine.log_event(
            uid,
            assessment=crisis,
            source="mirror",
            trigger_excerpt=user_message,
        )
    except Exception as e:
        print(f"[mirror] crisis log failed: {e}")

    return {
        "reply": reply_text,
        "user_msg_id": user_msg_id,
        "model_msg_id": model_msg_id,
        "crisis": crisis,
        "crisis_flag": crisis_flag,
        "context_used": {
            "readings_count": len(readings),
            "history_count": len(history),
            "latest_emotion": readings[0].get("emotion") if readings else None,
        },
    }
