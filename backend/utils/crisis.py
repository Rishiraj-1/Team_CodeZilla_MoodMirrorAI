"""
Crisis Intelligence System
--------------------------
A single source of truth for "is this user in danger?". Both the
Emotion Engine and Mirror call into here so the UX is consistent.

Design:
  Three signal sources, layered conservatively:
    1. Hard keyword tripwire    -> immediate level=crisis.
    2. Soft signals + history   -> level=watch or elevated.
    3. Gemini classifier        -> can RAISE level if it agrees.
                                   Cannot lower a hard match.

  We err toward false positives. A polite extra grounding moment is
  cheap. Missing a real crisis is not.

Output: a small CrisisAssessment dict that callers just pass through.

  {
    "level":         "none" | "watch" | "elevated" | "crisis",
    "probability":   0..100,
    "reasons":       list[str],
    "triggered_by":  "keyword" | "metrics" | "model" | "none",
  }

Persistence:
  crisis_events/{uid}/{push_id}: { level, reasons, created_at, source,
                                   trigger_excerpt }
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional

import requests

from ..database import rt_db


API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")


# ---------------------------------------------------------------------------
# Lexicons
# ---------------------------------------------------------------------------

# Tier 1: explicit self-harm / suicidal intent. Triggers level=crisis.
CRISIS_PHRASES: tuple[str, ...] = (
    "suicide",
    "kill myself",
    "kill my self",
    "end it all",
    "end my life",
    "ending my life",
    "ending it",
    "not worth living",
    "no reason to live",
    "do not want to live",
    "don't want to live",
    "want to die",
    "rather be dead",
    "be better off dead",
    "hurt myself",
    "harm myself",
    "self harm",
    "self-harm",
    "cut myself",
    "overdose",
    "jump off",
    "hang myself",
)

# Tier 2: soft distress signals. On their own = watch. Combined with
# elevated metrics or multiple hits = elevated.
SOFT_PHRASES: tuple[str, ...] = (
    "exhausted",
    "burned out",
    "burnt out",
    "can't go on",
    "cant go on",
    "can't keep going",
    "cant keep going",
    "can't anymore",
    "cant anymore",
    "hopeless",
    "pointless",
    "useless",
    "worthless",
    "alone",
    "lonely",
    "no one cares",
    "nobody cares",
    "trapped",
    "numb",
    "empty",
    "drowning",
    "tired of everything",
    "give up",
    "giving up",
    "panic",
    "panic attack",
    "can't breathe",
    "cant breathe",
)


LEVEL_RANK = {"none": 0, "watch": 1, "elevated": 2, "crisis": 3}


def _max_level(a: str, b: str) -> str:
    return a if LEVEL_RANK[a] >= LEVEL_RANK[b] else b


# ---------------------------------------------------------------------------
# Layer 1 + 2: deterministic
# ---------------------------------------------------------------------------

def _hard_match(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [p for p in CRISIS_PHRASES if p in low]


def _soft_match(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [p for p in SOFT_PHRASES if p in low]


def _recent_stress_summary(readings: list[dict]) -> dict:
    """Aggregates recent readings into a compact stress profile."""
    if not readings:
        return {"avg_stress": 0, "max_crisis_prob": 0, "n": 0}
    stress_vals: list[float] = []
    crisis_probs: list[float] = []
    for r in readings:
        m = r.get("metrics") or {}
        if isinstance(m.get("stress_score"), (int, float)):
            stress_vals.append(float(m["stress_score"]))
        if isinstance(m.get("crisis_probability"), (int, float)):
            crisis_probs.append(float(m["crisis_probability"]))
    avg = sum(stress_vals) / len(stress_vals) if stress_vals else 0
    mx = max(crisis_probs) if crisis_probs else 0
    return {"avg_stress": round(avg), "max_crisis_prob": round(mx), "n": len(readings)}


def _deterministic_assessment(text: str, readings: list[dict]) -> dict:
    """Layer 1 + 2. Returns a base assessment from rules only."""
    hard = _hard_match(text)
    soft = _soft_match(text)
    stress = _recent_stress_summary(readings)

    reasons: list[str] = []
    level = "none"
    probability = 0
    triggered_by = "none"

    if hard:
        level = "crisis"
        triggered_by = "keyword"
        probability = 90
        reasons.append(f"explicit self-harm phrase ({hard[0]!r})")
        if len(hard) > 1:
            reasons.append(f"+{len(hard) - 1} more explicit phrases")
        return {
            "level": level,
            "probability": probability,
            "reasons": reasons,
            "triggered_by": triggered_by,
        }

    # No hard match -> grade by soft signals + history.
    if soft:
        triggered_by = "keyword"
        if len(soft) >= 2:
            level = "elevated"
            probability = 55
            reasons.append(f"multiple distress phrases ({', '.join(soft[:3])})")
        else:
            level = "watch"
            probability = 30
            reasons.append(f"distress phrase ({soft[0]!r})")

    # Metrics can lift watch -> elevated if recent stress is consistently high
    # OR crisis_probability has been >=50 in the last few readings.
    if stress["n"] > 0:
        if stress["max_crisis_prob"] >= 50:
            level = _max_level(level, "elevated")
            triggered_by = "metrics" if level != "none" and not soft else triggered_by
            reasons.append(
                f"recent reading flagged crisis probability {stress['max_crisis_prob']}/100"
            )
            probability = max(probability, stress["max_crisis_prob"])
        elif stress["avg_stress"] >= 70 and soft:
            level = _max_level(level, "elevated")
            reasons.append(f"sustained high stress (avg {stress['avg_stress']}/100)")
            probability = max(probability, 60)
        elif stress["avg_stress"] >= 70:
            level = _max_level(level, "watch")
            reasons.append(f"sustained high stress (avg {stress['avg_stress']}/100)")
            probability = max(probability, 40)

    return {
        "level": level,
        "probability": probability,
        "reasons": reasons,
        "triggered_by": triggered_by,
    }


# ---------------------------------------------------------------------------
# Layer 3: Gemini (optional, can only RAISE level)
# ---------------------------------------------------------------------------

_MODEL_PROMPT = """You are a triage classifier for a mental-health companion app.
Classify the user's text into ONE of: none, watch, elevated, crisis.

Definitions:
- none:      neutral, positive, or mundane statement.
- watch:     mild distress, fatigue, sadness, low mood.
- elevated:  significant distress, hopelessness, panic, withdrawal, or
             expressions of feeling stuck or unsafe emotionally.
- crisis:    explicit or strongly implied self-harm, suicidal intent,
             plans, or imminent danger to self or others.

Be conservative on 'crisis': only use it for clear self-harm/suicidal
content. Be willing to use 'elevated' freely when distress is real.

Recent emotional readings are provided as soft context only.

Return STRICT JSON, no prose, no markdown:
{
  "level": "none" | "watch" | "elevated" | "crisis",
  "confidence": 0..1,
  "reason": short string (<= 120 chars)
}"""


def _call_gemini_classifier(text: str, readings: list[dict]) -> Optional[dict]:
    if not API_KEY or not text:
        return None

    history_lines = []
    for r in readings[:6]:
        m = r.get("metrics") or {}
        history_lines.append(
            f"- {r.get('created_at', '')[:16]} {r.get('emotion', '?')} "
            f"stress={int(m.get('stress_score', 0))} "
            f"crisis_prob={int(m.get('crisis_probability', 0))}"
        )
    history_block = "\n".join(history_lines) if history_lines else "(no prior readings)"

    parts = [
        {"text": _MODEL_PROMPT},
        {"text": f"\n--- RECENT HISTORY ---\n{history_block}"},
        {"text": f"\n--- USER TEXT ---\n{text}"},
    ]

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "generationConfig": {
            "temperature": 0.0,
            "response_mime_type": "application/json",
        },
        "contents": [{"role": "user", "parts": parts}],
    }
    try:
        res = requests.post(url, json=payload, timeout=15)
    except Exception as e:
        print(f"[crisis] gemini request failed: {e}")
        return None
    if res.status_code != 200:
        print(f"[crisis] gemini http {res.status_code}: {res.text[:200]}")
        return None

    data = res.json()
    try:
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        text_out = "\n".join(
            p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])
            if isinstance(p, dict)
        ).strip()
        if not text_out:
            return None
        try:
            parsed = json.loads(text_out)
        except Exception:
            return None
        lvl = str(parsed.get("level", "")).lower()
        if lvl not in LEVEL_RANK:
            return None
        try:
            conf = float(parsed.get("confidence", 0.5))
        except Exception:
            conf = 0.5
        reason = str(parsed.get("reason", "")).strip()[:200]
        return {"level": lvl, "confidence": max(0.0, min(1.0, conf)), "reason": reason}
    except Exception as e:
        print(f"[crisis] gemini parse error: {e}")
        return None


# ---------------------------------------------------------------------------
# Public: classify
# ---------------------------------------------------------------------------

def classify(text: str, readings: Optional[list[dict]] = None) -> dict:
    """The single entrypoint other modules use."""
    readings = readings or []
    base = _deterministic_assessment(text or "", readings)

    # If the deterministic layer already says crisis, skip the model call.
    # We don't want a model softening a hard match, and we save tokens.
    if base["level"] == "crisis":
        return base

    model = _call_gemini_classifier(text or "", readings)
    if not model:
        return base

    # Model can only raise. Combine reasons.
    raised = _max_level(base["level"], model["level"])
    if LEVEL_RANK[raised] > LEVEL_RANK[base["level"]]:
        base["level"] = raised
        base["triggered_by"] = "model"
        if model.get("reason"):
            base["reasons"].append(f"model: {model['reason']}")
        # Bump probability to reflect the model's confidence in 0..100
        model_prob = int(model.get("confidence", 0.5) * 100)
        base["probability"] = max(base["probability"], model_prob, 60)

    return base


# ---------------------------------------------------------------------------
# Persistence + reads
# ---------------------------------------------------------------------------

def log_event(
    uid: str,
    *,
    assessment: dict,
    source: str,
    trigger_excerpt: Optional[str] = None,
) -> Optional[str]:
    """Log only level >= watch. Skip 'none' to keep noise out.

    Honors privacy.allow_crisis_log: if the user has opted out of the
    crisis audit trail, we do NOT persist. The classifier still runs
    so safety UI fires; we just don't keep records.
    """
    if assessment.get("level") in (None, "none"):
        return None

    # Lazy import to avoid a circular dependency at module load time.
    try:
        from . import privacy as privacy_engine  # noqa: WPS433
        if not privacy_engine.get_consent(uid).get("allow_crisis_log", True):
            return None
    except Exception as e:
        # If consent lookup fails, default to logging -- safety bias.
        print(f"[crisis] consent check failed, logging anyway: {e}")

    payload = {
        "level": assessment["level"],
        "probability": assessment.get("probability", 0),
        "reasons": assessment.get("reasons", []),
        "triggered_by": assessment.get("triggered_by", "none"),
        "source": source,                                # 'engine' | 'mirror' | 'manual'
        "trigger_excerpt": (trigger_excerpt or "")[:200],
        "created_at": datetime.utcnow().isoformat(),
    }
    try:
        return rt_db.reference(f"crisis_events/{uid}").push(payload).key
    except Exception as e:
        print(f"[crisis] log_event failed: {e}")
        return None


def recent_events(uid: str, limit: int = 10) -> list[dict]:
    try:
        data = rt_db.reference(f"crisis_events/{uid}").get()
    except Exception as e:
        print(f"[crisis] recent_events read failed: {e}")
        return []
    if not data:
        return []
    items = []
    for k, v in data.items():
        if isinstance(v, dict):
            items.append({**v, "id": k})
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items[:limit]


# ---------------------------------------------------------------------------
# Wellbeing summary (for "tell someone" flow)
# ---------------------------------------------------------------------------

_SUMMARY_PROMPT = """You are helping a user write a short, gentle message they can
send to a trusted friend or family member. The user is going through a
hard moment.

Write a message:
- In FIRST person (the user is speaking).
- 2-3 short sentences, warm and honest.
- Asks the recipient for presence -- a call, a text, sitting together.
- Does NOT mention the app, AI, scores, or 'crisis'.
- Does NOT use clinical words ('depression', 'episode', 'symptom').
- Plain text only. No headings.

Recent context (do not echo): {context}

Return ONLY the message text, nothing else."""


def _fallback_summary() -> str:
    return (
        "Hey -- I'm having a hard time today and could really use a kind voice. "
        "Could you call me, or just sit with me for a bit? It would mean a lot."
    )


def generate_wellbeing_summary(uid: str) -> str:
    """Generate a short message the user can forward to a support contact."""
    # Read last few readings for tone (we won't echo metrics).
    try:
        data = rt_db.reference(f"readings/{uid}").get()
    except Exception:
        data = None
    readings: list[dict] = []
    if data:
        for k, v in data.items():
            if isinstance(v, dict):
                readings.append(v)
    readings.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    readings = readings[:5]

    context_parts = []
    for r in readings:
        context_parts.append(r.get("emotion", "Neutral"))
    context = ", ".join(context_parts) if context_parts else "no recent readings"

    if not API_KEY:
        return _fallback_summary()

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 200},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": _SUMMARY_PROMPT.format(context=context)}],
            }
        ],
    }
    try:
        res = requests.post(url, json=payload, timeout=20)
    except Exception as e:
        print(f"[crisis] summary request failed: {e}")
        return _fallback_summary()
    if res.status_code != 200:
        print(f"[crisis] summary http {res.status_code}: {res.text[:200]}")
        return _fallback_summary()

    try:
        candidates = res.json().get("candidates", [])
        if not candidates:
            return _fallback_summary()
        text = "\n".join(
            p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])
            if isinstance(p, dict)
        ).strip()
        # Strip surrounding quotes Gemini sometimes adds
        text = text.strip('"\u201c\u201d')
        return text or _fallback_summary()
    except Exception:
        return _fallback_summary()
