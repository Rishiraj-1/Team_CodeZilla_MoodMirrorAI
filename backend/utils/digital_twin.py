"""
Digital Twin 2.0
----------------
Builds a continuously evolving profile of the user's emotional patterns
from the time-series the Engine writes to readings/{uid} and the events
the Crisis module writes to crisis_events/{uid}.

Two layers:

  1. profile (deterministic)
       Real numbers, no Gemini. Dominant emotion, avg/max stress,
       resilience score, volatility, by-hour stress, trigger words,
       crisis history, check-in streak.

  2. insights (Gemini, grounded)
       Narrative + 7-day forecast + ranked coping recommendations.
       Gemini reads the profile JSON; it does NOT see raw data and is
       not asked to fabricate statistics.

Empty-state policy: if fewer than MIN_READINGS samples exist, we return
sufficient_data=False and skip the Gemini call. We will NOT make up
numbers to fill a dashboard.
"""
from __future__ import annotations

import json
import os
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from ..database import rt_db


API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")

# How many days of history to include in the profile.
WINDOW_DAYS = 14

# Below this many readings, we refuse to fabricate a profile.
MIN_READINGS = 5

# Stop-words for trigger extraction. Plain English; not a perfect set,
# but good enough that we surface real signal not "I" / "the" / "and".
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "of", "at", "by",
    "for", "with", "in", "on", "to", "from", "is", "are", "was", "were",
    "be", "been", "being", "am", "i", "you", "he", "she", "it", "we",
    "they", "me", "my", "your", "his", "her", "our", "their", "this",
    "that", "these", "those", "so", "as", "do", "does", "did", "have",
    "has", "had", "not", "no", "yes", "just", "really", "very", "too",
    "much", "many", "some", "any", "all", "none", "lot", "lots",
    "going", "go", "get", "got", "feel", "feeling", "felt", "today",
    "tomorrow", "yesterday", "again", "still", "now", "here", "there",
    "what", "when", "where", "who", "why", "how", "can", "cannot",
    "cant", "wont", "dont", "didnt", "im", "ive", "id", "ill", "its",
}


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Stored timestamps are naive UTC (datetime.utcnow().isoformat()).
        dt = datetime.fromisoformat(s.replace("Z", ""))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _load_readings(uid: str, *, days: int = WINDOW_DAYS) -> list[dict]:
    """Chronological (oldest-first) list of readings within the window."""
    try:
        data = rt_db.reference(f"readings/{uid}").get()
    except Exception as e:
        print(f"[twin] readings load failed: {e}")
        return []
    if not data:
        return []
    cutoff = _now_utc() - timedelta(days=days)
    items: list[dict] = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        dt = _parse_iso(v.get("created_at", ""))
        if not dt or dt < cutoff:
            continue
        items.append({**v, "id": k, "_dt": dt})
    items.sort(key=lambda x: x["_dt"])
    return items


def _load_crisis_events(uid: str, *, days: int = WINDOW_DAYS) -> list[dict]:
    try:
        data = rt_db.reference(f"crisis_events/{uid}").get()
    except Exception as e:
        print(f"[twin] crisis_events load failed: {e}")
        return []
    if not data:
        return []
    cutoff = _now_utc() - timedelta(days=days)
    items = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        dt = _parse_iso(v.get("created_at", ""))
        if not dt or dt < cutoff:
            continue
        items.append({**v, "id": k, "_dt": dt})
    items.sort(key=lambda x: x["_dt"])
    return items


def _load_text_inputs(uid: str, *, days: int = WINDOW_DAYS) -> list[str]:
    """Pulls user-submitted text from the legacy reports/{uid} tree.

    The Engine writes raw text there for back-compat (the new readings
    tree intentionally does NOT store raw text -- privacy by default).
    For the twin's trigger-word analysis we re-use that legacy stream.
    """
    try:
        data = rt_db.reference(f"reports/{uid}").get()
    except Exception:
        return []
    if not data:
        return []
    cutoff = _now_utc() - timedelta(days=days)
    out: list[str] = []
    for _, v in data.items():
        if not isinstance(v, dict):
            continue
        dt = _parse_iso(v.get("created_at", ""))
        if not dt or dt < cutoff:
            continue
        # Only count negative-leaning entries (where triggers actually live).
        analysis = v.get("analysis") or {}
        emotion = (analysis.get("emotion") or "").lower()
        if emotion not in ("sad", "anxious", "angry"):
            continue
        text = v.get("text")
        if isinstance(text, str) and text.strip():
            out.append(text.strip())
    return out


# ---------------------------------------------------------------------------
# Math: aggregations
# ---------------------------------------------------------------------------

def _stress_series(readings: list[dict]) -> list[float]:
    out = []
    for r in readings:
        m = r.get("metrics") or {}
        s = m.get("stress_score")
        if isinstance(s, (int, float)):
            out.append(float(s))
    return out


def _emotion_counts(readings: list[dict]) -> Counter:
    c = Counter()
    for r in readings:
        e = r.get("emotion") or "Neutral"
        c[e] += 1
    return c


def _by_hour_stress(readings: list[dict]) -> dict[int, float]:
    """Average stress per hour-of-day. Sparse hours absent."""
    bucket: dict[int, list[float]] = defaultdict(list)
    for r in readings:
        m = r.get("metrics") or {}
        s = m.get("stress_score")
        if not isinstance(s, (int, float)):
            continue
        h = r["_dt"].astimezone(timezone.utc).hour
        bucket[h].append(float(s))
    return {h: round(sum(v) / len(v), 1) for h, v in bucket.items() if v}


def _streak_days(readings: list[dict]) -> int:
    """Consecutive days (counting back from today) with >=1 reading."""
    if not readings:
        return 0
    days_with = {r["_dt"].astimezone(timezone.utc).date() for r in readings}
    today = _now_utc().date()
    streak = 0
    cursor = today
    while cursor in days_with:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _recovery_speed(stress_series: list[float]) -> Optional[float]:
    """How fast stress drops after a peak.

    Definition: average per-step drop after any reading >= 70.
    Returns None if there are no peaks. Higher = faster recovery.
    """
    if len(stress_series) < 2:
        return None
    drops = []
    for i, s in enumerate(stress_series[:-1]):
        if s >= 70:
            # Look at the next reading; positive drop means recovery
            drop = s - stress_series[i + 1]
            drops.append(drop)
    if not drops:
        return None
    return round(sum(drops) / len(drops), 1)


def _resilience_score(
    *,
    avg_stress: float,
    recovery: Optional[float],
    crisis_count: int,
    streak: int,
    n_readings: int,
) -> int:
    """0..100 composite. Documented in the README of the twin module.

    Components, all clamped 0..100:
      - calm_factor = 100 - avg_stress       (lower stress -> higher)
      - recovery_factor = clamp((recovery or 0) * 5, 0, 100)
                                              (faster drops after peaks)
      - safety_factor = max(0, 100 - crisis_count * 25)
      - consistency_factor = min(100, streak * 14)  (2 wks streak -> 100)

    Weights chosen to put the most weight on calm + safety, since those
    are the most ground-truth indicators of someone doing OK.
    """
    calm = max(0.0, 100.0 - avg_stress)
    recovery_factor = max(0.0, min(100.0, (recovery or 0.0) * 5.0))
    safety_factor = max(0.0, 100.0 - crisis_count * 25.0)
    consistency = min(100.0, streak * 14.0)

    score = (
        0.35 * calm
        + 0.20 * recovery_factor
        + 0.30 * safety_factor
        + 0.15 * consistency
    )
    # Penalize tiny samples lightly; we don't want to certify someone
    # as resilient based on 5 datapoints.
    if n_readings < 10:
        score *= 0.85

    return int(max(0, min(100, round(score))))


def _trigger_words(texts: list[str], *, top_n: int = 5) -> list[str]:
    if not texts:
        return []
    blob = " ".join(texts).lower()
    words = re.findall(r"[a-z][a-z\-']{2,}", blob)
    counts = Counter()
    for w in words:
        if w in _STOPWORDS:
            continue
        if len(w) < 3:
            continue
        counts[w] += 1
    return [w for w, _ in counts.most_common(top_n)]


def _best_worst_hours(by_hour: dict[int, float]) -> tuple[Optional[int], Optional[int]]:
    if not by_hour or len(by_hour) < 2:
        return (None, None)
    best = min(by_hour.items(), key=lambda kv: kv[1])[0]
    worst = max(by_hour.items(), key=lambda kv: kv[1])[0]
    return (best, worst)


# ---------------------------------------------------------------------------
# Profile builder
# ---------------------------------------------------------------------------

def build_profile(uid: str) -> dict:
    readings = _load_readings(uid)
    crisis_events = _load_crisis_events(uid)

    n = len(readings)

    if n < MIN_READINGS:
        return {
            "sufficient_data": False,
            "n_readings": n,
            "min_required": MIN_READINGS,
            "window_days": WINDOW_DAYS,
        }

    stress = _stress_series(readings)
    avg_stress = round(sum(stress) / len(stress), 1) if stress else 0.0
    max_stress = round(max(stress), 1) if stress else 0.0

    burnout_vals = [
        (r.get("metrics") or {}).get("burnout_risk")
        for r in readings
        if isinstance((r.get("metrics") or {}).get("burnout_risk"), (int, float))
    ]
    avg_burnout = round(sum(burnout_vals) / len(burnout_vals), 1) if burnout_vals else 0.0

    volatility = (
        round(statistics.pstdev(stress) * 2.0, 1) if len(stress) >= 2 else 0.0
    )
    volatility = max(0.0, min(100.0, volatility))

    recovery = _recovery_speed(stress)
    streak = _streak_days(readings)

    counts = _emotion_counts(readings)
    dominant_emotion = counts.most_common(1)[0][0] if counts else "Neutral"

    by_hour = _by_hour_stress(readings)
    best_hr, worst_hr = _best_worst_hours(by_hour)

    crisis_count = sum(1 for e in crisis_events if e.get("level") in ("elevated", "crisis"))
    last_crisis = (
        crisis_events[-1]["created_at"] if crisis_events else None
    )

    triggers = _trigger_words(_load_text_inputs(uid))

    resilience = _resilience_score(
        avg_stress=avg_stress,
        recovery=recovery,
        crisis_count=crisis_count,
        streak=streak,
        n_readings=n,
    )

    # Last 7 days of stress as a sparkline-ready series.
    sparkline: list[dict] = []
    today = _now_utc().date()
    daily: dict = defaultdict(list)
    for r in readings:
        d = r["_dt"].astimezone(timezone.utc).date()
        s = (r.get("metrics") or {}).get("stress_score")
        if isinstance(s, (int, float)):
            daily[d].append(float(s))
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        vals = daily.get(d) or []
        sparkline.append(
            {
                "date": d.isoformat(),
                "avg_stress": round(sum(vals) / len(vals), 1) if vals else None,
                "samples": len(vals),
            }
        )

    return {
        "sufficient_data": True,
        "n_readings": n,
        "window_days": WINDOW_DAYS,
        "resilience_score": resilience,
        "dominant_emotion": dominant_emotion,
        "emotion_distribution": dict(counts),
        "avg_stress": avg_stress,
        "max_stress": max_stress,
        "avg_burnout": avg_burnout,
        "volatility": volatility,
        "recovery_speed": recovery,        # None if no peaks
        "streak_days": streak,
        "by_hour_stress": by_hour,
        "best_hour": best_hr,
        "worst_hour": worst_hr,
        "trigger_words": triggers,
        "crisis_count": crisis_count,
        "last_crisis": last_crisis,
        "stress_sparkline": sparkline,
    }


# ---------------------------------------------------------------------------
# Gemini insights (grounded by the profile)
# ---------------------------------------------------------------------------

_INSIGHTS_PROMPT = """You are the Digital Twin reasoning layer for MoodMirror.
You receive a profile JSON of the user's last {window} days. Your job is
to produce a short, grounded narrative -- NEVER invent numbers, only
explain what the numbers say.

Return STRICT JSON, no prose, no markdown. Schema:

{{
  "headline": short string (<= 80 chars). Single sentence summarizing
              this person's emotional state right now.
  "insights": [                   // 2-3 items
    {{ "title": short string, "detail": short string (<= 200 chars) }}
  ],
  "forecast": [                   // exactly 7 items, today + 6 days
    {{
      "day_offset": integer 0..6,
      "risk": "low" | "medium" | "high",
      "reason": short string (<= 120 chars)
    }}
  ],
  "recommendations": [            // 3-5 items, ranked by relevance
    {{
      "title": short string,
      "why": short string (<= 160 chars),
      "category": "breathing" | "journaling" | "social" | "sleep"
                  | "movement" | "break" | "professional"
    }}
  ]
}}

Rules:
- Tone: warm, plain, second-person. NOT clinical.
- Insights must reference numbers from the profile (e.g. "Your stress
  averages 58/100" or "Your resilience score is 64").
- Forecast: be conservative. Only call a day 'high' if the recent
  trend genuinely points there. 'low' or 'medium' is the default.
- Recommendations: pick categories that match the profile's actual
  weaknesses (e.g. high volatility -> breathing; many crisis events ->
  professional + social).
- NEVER diagnose ("you have anxiety/depression"). Talk about patterns.

Profile:
{profile_json}
"""


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


def _heuristic_insights(profile: dict) -> dict:
    """Used when Gemini is unavailable. Honest, profile-grounded.

    No fictional numbers, no fictional reasons. Just translates the
    deterministic profile into plain text.
    """
    avg = profile.get("avg_stress", 0)
    res = profile.get("resilience_score", 0)
    dom = profile.get("dominant_emotion", "Neutral")
    triggers = profile.get("trigger_words") or []
    streak = profile.get("streak_days", 0)
    crisis_count = profile.get("crisis_count", 0)

    if avg >= 70:
        headline = f"Stress has averaged {int(avg)}/100. You've been carrying a lot."
    elif avg >= 40:
        headline = f"Mixed week. Stress around {int(avg)}/100, dominantly {dom}."
    else:
        headline = f"You're in a calm window: avg stress {int(avg)}/100, mostly {dom}."

    insights = [
        {
            "title": "Resilience score",
            "detail": f"Your resilience score is {res}/100, computed from your "
                      f"average stress, recovery speed, crisis history, and "
                      f"check-in streak ({streak} days).",
        },
        {
            "title": "Recent pattern",
            "detail": f"Across {profile['n_readings']} readings in the last "
                      f"{profile['window_days']} days, your dominant emotion is "
                      f"{dom}.",
        },
    ]
    if triggers:
        insights.append(
            {
                "title": "Words showing up around hard moments",
                "detail": "From your text entries: " + ", ".join(triggers[:5]),
            }
        )

    # Conservative forecast: spread the recent average forward.
    risk = "high" if avg >= 70 or crisis_count > 0 else "medium" if avg >= 40 else "low"
    forecast = [
        {"day_offset": i, "risk": risk, "reason": "Projected from your recent average."}
        for i in range(7)
    ]

    recs = [
        {
            "title": "3-minute box breathing",
            "why": "Lowers acute stress; works in <5 minutes.",
            "category": "breathing",
        },
        {
            "title": "One-line journal entry",
            "why": "Notice what's actually weighing on you. No pressure to write more.",
            "category": "journaling",
        },
    ]
    if crisis_count > 0:
        recs.insert(
            0,
            {
                "title": "Reach out to someone you trust",
                "why": "You've had a hard moment recently. A short message is enough.",
                "category": "social",
            },
        )

    return {
        "headline": headline,
        "insights": insights,
        "forecast": forecast,
        "recommendations": recs,
        "_degraded": True,
    }


def _call_gemini(profile: dict) -> Optional[dict]:
    if not API_KEY:
        return None
    prompt = _INSIGHTS_PROMPT.format(
        window=profile.get("window_days", WINDOW_DAYS),
        profile_json=json.dumps(profile, default=str),
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "generationConfig": {
            "temperature": 0.4,
            "response_mime_type": "application/json",
        },
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    }
    try:
        res = requests.post(url, json=payload, timeout=30)
    except Exception as e:
        print(f"[twin] gemini request failed: {e}")
        return None
    if res.status_code != 200:
        print(f"[twin] gemini http {res.status_code}: {res.text[:200]}")
        return None
    try:
        candidates = res.json().get("candidates", [])
        if not candidates:
            return None
        text = "\n".join(
            p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])
            if isinstance(p, dict)
        ).strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            block = _find_json_block(text)
            if not block:
                return None
            return json.loads(block)
    except Exception as e:
        print(f"[twin] gemini parse error: {e}")
        return None


def generate_insights(profile: dict) -> dict:
    parsed = _call_gemini(profile)
    if not parsed:
        return _heuristic_insights(profile)

    # Sanitize: enforce shape so the frontend can trust the response.
    out = {
        "headline": str(parsed.get("headline") or "").strip()[:200],
        "insights": [],
        "forecast": [],
        "recommendations": [],
        "_degraded": False,
    }
    for item in (parsed.get("insights") or [])[:4]:
        if isinstance(item, dict) and item.get("title"):
            out["insights"].append(
                {
                    "title": str(item["title"])[:120],
                    "detail": str(item.get("detail") or "")[:300],
                }
            )

    for item in (parsed.get("forecast") or [])[:7]:
        if not isinstance(item, dict):
            continue
        risk = str(item.get("risk", "low")).lower()
        if risk not in ("low", "medium", "high"):
            risk = "low"
        try:
            offset = int(item.get("day_offset", 0))
        except Exception:
            offset = 0
        offset = max(0, min(6, offset))
        out["forecast"].append(
            {
                "day_offset": offset,
                "risk": risk,
                "reason": str(item.get("reason") or "")[:200],
            }
        )

    # Pad/sort forecast to exactly 7 days starting today.
    have = {f["day_offset"]: f for f in out["forecast"]}
    out["forecast"] = []
    for i in range(7):
        if i in have:
            out["forecast"].append(have[i])
        else:
            out["forecast"].append(
                {"day_offset": i, "risk": "low", "reason": "Insufficient signal."}
            )

    # Stamp dates onto the forecast for the UI.
    today = _now_utc().date()
    for f in out["forecast"]:
        f["date"] = (today + timedelta(days=f["day_offset"])).isoformat()

    for item in (parsed.get("recommendations") or [])[:5]:
        if isinstance(item, dict) and item.get("title"):
            cat = str(item.get("category", "break")).lower()
            if cat not in (
                "breathing", "journaling", "social", "sleep",
                "movement", "break", "professional",
            ):
                cat = "break"
            out["recommendations"].append(
                {
                    "title": str(item["title"])[:120],
                    "why": str(item.get("why") or "")[:240],
                    "category": cat,
                }
            )

    if not out["recommendations"]:
        # Don't ship a Twin without recommendations -- pull from the
        # heuristic fallback for guaranteed UX.
        out["recommendations"] = _heuristic_insights(profile)["recommendations"]

    return out


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def get_twin(uid: str) -> dict:
    """The single entrypoint for /api/digital_twin/me."""
    profile = build_profile(uid)
    if not profile.get("sufficient_data"):
        return {"profile": profile, "insights": None}
    insights = generate_insights(profile)
    return {"profile": profile, "insights": insights}
