"""
Hyper-Personalization layer.

Stores per-user profile preferences (culture, language, age band,
spirituality) and emits two small artifacts that the rest of the
Gemini-driven features consume:

  - cultural_block(profile)
        a short, neutral, prompt-ready paragraph for system prompts.
        Mirror, Twin, and Support narratives all inject this so the
        AI's coping suggestions and tone shift with context.

  - regional_helplines(profile)
        the right helpline list for the user's region. The Crisis
        Modal calls this instead of hardcoding India numbers.

We deliberately do NOT auto-detect culture or language from text --
that's brittle and intrusive. The user picks; we honor.

Persistence: user_prefs/{uid}/profile in Firebase RTDB.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from ..database import rt_db


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

LANGUAGES = ("en", "hi", "en-IN")
CULTURES = ("none", "indian", "western", "east-asian")
AGE_BANDS = ("teen", "adult", "senior")
SPIRITUALITIES = (
    "none",
    "spiritual",
    "hindu",
    "muslim",
    "christian",
    "sikh",
    "buddhist",
)

DEFAULT_PROFILE: dict[str, str] = {
    "language": "en",
    "culture": "none",
    "age_band": "adult",
    "spirituality": "none",
}


def _validate(key: str, value: Any) -> Any:
    """Drop unknown values rather than store junk."""
    if not isinstance(value, str):
        return None
    if key == "language":
        return value if value in LANGUAGES else None
    if key == "culture":
        return value if value in CULTURES else None
    if key == "age_band":
        return value if value in AGE_BANDS else None
    if key == "spirituality":
        return value if value in SPIRITUALITIES else None
    return None


# ---------------------------------------------------------------------------
# Read / write
# ---------------------------------------------------------------------------

def get_profile(uid: str) -> dict[str, str]:
    """Always returns a complete dict; missing keys fall back to default."""
    try:
        data = rt_db.reference(f"user_prefs/{uid}/profile").get() or {}
    except Exception as e:
        print(f"[personalization] read failed: {e}")
        data = {}
    out = dict(DEFAULT_PROFILE)
    if isinstance(data, dict):
        for k in DEFAULT_PROFILE:
            v = data.get(k)
            cleaned = _validate(k, v)
            if cleaned is not None:
                out[k] = cleaned
    return out


def set_profile(uid: str, patch: dict[str, Any]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for k in DEFAULT_PROFILE:
        if k in patch:
            v = _validate(k, patch[k])
            if v is not None:
                cleaned[k] = v
    if not cleaned:
        return get_profile(uid)
    payload = {**cleaned, "updated_at": datetime.utcnow().isoformat()}
    try:
        rt_db.reference(f"user_prefs/{uid}/profile").update(payload)
    except Exception as e:
        print(f"[personalization] write failed: {e}")
    return get_profile(uid)


# ---------------------------------------------------------------------------
# Prompt block
# ---------------------------------------------------------------------------

_LANG_LINE = {
    "en":    "User's preferred language: English (international).",
    "hi":    "User's preferred language: Hindi. Reply in Hindi (Devanagari) or Hinglish if they mix.",
    "en-IN": "User's preferred language: Indian English. Match their phrasing.",
}

_CULTURE_LINE = {
    "none":       "",
    "indian":     (
        "User identifies with Indian cultural context. When suggesting coping, "
        "prefer culturally relevant practices: pranayama (Anulom-Vilom, Bhramari), "
        "short walks, calls with parents/elders, simple home rituals. Family "
        "connection is often a strength here, not codependence."
    ),
    "western":    (
        "User identifies with Western individualist context. Mindfulness, "
        "journaling, cognitive reframing, and therapist-style language fit well."
    ),
    "east-asian": (
        "User identifies with East Asian context. Pair self-compassion language "
        "with respect for collective and family context."
    ),
}

_AGE_LINE = {
    "teen":   "User is a teenager. Avoid parental or clinical tone. School and social pressures are real and weighty for them.",
    "adult":  "",
    "senior": "User is an older adult. Avoid teen-coded slang. Lean on simpler, well-established practices and longer-form questions.",
}

_SPIRITUALITY_LINE = {
    "none":      "",
    "spiritual": "User describes themselves as spiritual but not religious. Light reflective framing is welcome; do not invoke any specific tradition unprompted.",
    "hindu":     "User identifies as Hindu. Where genuinely helpful, you may reference simple personal practices like a quiet pooja moment, mantra repetition, or gratitude. Never preach.",
    "muslim":    "User identifies as Muslim. Where genuinely helpful, you may gently reference taking a moment for dua or wudu. Never preach.",
    "christian": "User identifies as Christian. Where genuinely helpful, you may gently reference quiet prayer or scripture reflection. Never preach.",
    "sikh":      "User identifies as Sikh. Where genuinely helpful, you may gently reference a moment of simran or remembering Waheguru. Never preach.",
    "buddhist":  "User identifies as Buddhist. Where genuinely helpful, you may reference brief mindfulness/metta-style practices. Never preach.",
}


def cultural_block(profile: dict[str, str] | None) -> str:
    """Returns a short paragraph for system prompts. Empty if profile is
    fully default (no signal to inject)."""
    if not profile:
        return ""
    parts: list[str] = []
    parts.append(_LANG_LINE.get(profile.get("language", "en"), ""))
    c = _CULTURE_LINE.get(profile.get("culture", "none"), "")
    if c:
        parts.append(c)
    a = _AGE_LINE.get(profile.get("age_band", "adult"), "")
    if a:
        parts.append(a)
    s = _SPIRITUALITY_LINE.get(profile.get("spirituality", "none"), "")
    if s:
        parts.append(s)

    parts = [p for p in parts if p]
    if not parts:
        return ""
    return "User personalization context:\n" + "\n".join(f"- {p}" for p in parts)


# ---------------------------------------------------------------------------
# Helplines
# ---------------------------------------------------------------------------

# Each helpline has: label, number, region
_HELPLINES = {
    "india": [
        {"label": "iCall",                "number": "9152987821",   "region": "India"},
        {"label": "Vandrevala Foundation","number": "1860-2662-345","region": "India, 24/7"},
        {"label": "AASRA",                "number": "9820466726",   "region": "India, 24/7"},
    ],
    "us": [
        {"label": "988 Lifeline",         "number": "988",          "region": "US, 24/7"},
        {"label": "Crisis Text Line",     "number": "741741",       "region": "US: text HOME"},
    ],
    "uk": [
        {"label": "Samaritans",           "number": "116123",       "region": "UK + Ireland, 24/7"},
        {"label": "Shout",                "number": "85258",        "region": "UK: text SHOUT"},
    ],
    "global": [
        {"label": "Befrienders Worldwide","number": "+44-020-8394-8300", "region": "Find local: befrienders.org"},
    ],
}


def regional_helplines(profile: dict[str, str] | None) -> list[dict]:
    """Pick helplines using a soft signal from culture + language.

    We default to India because that's the user base; we widen out only
    when there's a clear non-Indian signal. Always include the global
    pointer as a final fallback.
    """
    culture = (profile or {}).get("culture", "none")
    language = (profile or {}).get("language", "en")

    if culture == "western" and language != "hi":
        return list(_HELPLINES["us"]) + list(_HELPLINES["uk"]) + list(_HELPLINES["global"])
    if culture == "east-asian":
        return list(_HELPLINES["global"]) + list(_HELPLINES["india"])
    # Default: India (and add the global pointer for safety)
    return list(_HELPLINES["india"]) + list(_HELPLINES["global"])
