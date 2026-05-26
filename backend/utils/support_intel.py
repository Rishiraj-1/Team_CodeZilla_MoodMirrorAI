"""
Smart Support Network -- intelligence layer.

Computes a severity score from the user's recent readings + crisis
events, generates audience-tailored wellbeing narratives via Gemini
(friend / family / therapist), and emits suggested actions per
audience that escalate with severity.

This is the *standalone* support layer. The Crisis Modal's "Reach out"
tab in step 3 generates a single one-line message for in-the-moment use.
This module is the longer view: "here's the picture of the last 14
days, and here's how to share it with someone who could help."

Determinism:
- compute_severity(): pure math, no Gemini.
- generate_wellbeing_report(): Gemini for the narrative, BUT only ever
  reads the precomputed severity + a small profile summary -- it is
  never asked to invent statistics. Heuristic fallback if Gemini fails.
"""
from __future__ import annotations

import json
import os
import re
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from ..database import rt_db
from .digital_twin import _parse_iso


API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")

WINDOW_DAYS = 14
RECENT_DAYS = 7
MIN_READINGS = 5


# ---------------------------------------------------------------------------
# Loaders (window-scoped)
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _load_window(path: str, days: int) -> list[dict]:
    try:
        data = rt_db.reference(path).get()
    except Exception as e:
        print(f"[support_intel] load {path} failed: {e}")
        return []
    if not data:
        return []
    cutoff = _now_utc() - timedelta(days=days)
    out = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        dt = _parse_iso(v.get("created_at", ""))
        if not dt or dt < cutoff:
            continue
        out.append({**v, "id": k, "_dt": dt})
    out.sort(key=lambda x: x["_dt"])
    return out


# ---------------------------------------------------------------------------
# Severity scoring
# ---------------------------------------------------------------------------

def compute_severity(uid: str) -> dict:
    """0..100 severity score with explicit contributing factors.

    Returns:
      {
        "sufficient_data":      bool,
        "score":                int | None,
        "level":                "green" | "amber" | "red" | "unknown",
        "factors":              list[str],
        "context": {
          "n_readings":         int,
          "n_crisis_events":    int,
          "avg_stress":         int,
          "avg_crisis_prob":    int,
          "dominant_emotion":   str | None,
          "window_days":        int,
          "recent_days":        int,
        }
      }
    """
    readings = _load_window(f"readings/{uid}", WINDOW_DAYS)
    crisis_events = _load_window(f"crisis_events/{uid}", WINDOW_DAYS)

    n = len(readings)
    if n < MIN_READINGS:
        return {
            "sufficient_data": False,
            "score": None,
            "level": "unknown",
            "factors": [],
            "context": {
                "n_readings": n,
                "min_required": MIN_READINGS,
                "window_days": WINDOW_DAYS,
                "recent_days": RECENT_DAYS,
            },
        }

    # Slice the recent (last 7d) sub-window
    recent_cutoff = _now_utc() - timedelta(days=RECENT_DAYS)
    recent = [r for r in readings if r["_dt"] >= recent_cutoff]

    def m(r, key):
        return (r.get("metrics") or {}).get(key)

    # ---- numbers ----
    stress_all = [float(m(r, "stress_score")) for r in readings if isinstance(m(r, "stress_score"), (int, float))]
    crisis_probs_recent = [
        float(m(r, "crisis_probability"))
        for r in recent
        if isinstance(m(r, "crisis_probability"), (int, float))
    ]
    avg_stress = round(sum(stress_all) / len(stress_all), 1) if stress_all else 0.0
    avg_crisis_prob = (
        round(sum(crisis_probs_recent) / len(crisis_probs_recent), 1)
        if crisis_probs_recent
        else 0.0
    )
    volatility = (
        round(statistics.pstdev(stress_all) * 2.0, 1) if len(stress_all) >= 2 else 0.0
    )
    volatility = max(0.0, min(100.0, volatility))

    n_events = sum(1 for e in crisis_events if e.get("level") in ("elevated", "crisis"))

    counts = Counter(r.get("emotion") or "Neutral" for r in readings)
    dominant_emotion = counts.most_common(1)[0][0] if counts else None

    neg_set = {"Anxious", "Sad", "Angry"}
    recent_neg = sum(1 for r in recent if r.get("emotion") in neg_set)
    neg_share = recent_neg / len(recent) if recent else 0.0

    # ---- score components ----
    score = 0.0
    factors: list[str] = []

    # Crisis probability (recent) is the strongest single signal.
    score += avg_crisis_prob * 0.4
    if avg_crisis_prob >= 30:
        factors.append(
            f"avg crisis-signal {int(avg_crisis_prob)}/100 over last {RECENT_DAYS} days"
        )

    # Logged crisis events.
    score += min(60.0, n_events * 15.0)
    if n_events == 1:
        factors.append("1 crisis event in last 14 days")
    elif n_events > 1:
        factors.append(f"{n_events} crisis events in last 14 days")

    # Sustained high stress.
    if avg_stress >= 70:
        score += 20
        factors.append(f"sustained high stress (avg {int(avg_stress)}/100)")
    elif avg_stress >= 55:
        score += 8
        factors.append(f"elevated stress (avg {int(avg_stress)}/100)")

    # Negative emotion dominance in the recent week.
    if recent and neg_share > 0.6:
        score += 15
        pct = int(neg_share * 100)
        factors.append(f"{pct}% of recent readings are Anxious / Sad / Angry")

    # Volatility.
    if volatility >= 50:
        score += 10
        factors.append(f"high emotional volatility ({int(volatility)}/100)")

    score = max(0.0, min(100.0, round(score)))
    if score >= 66:
        level = "red"
    elif score >= 31:
        level = "amber"
    else:
        level = "green"

    return {
        "sufficient_data": True,
        "score": int(score),
        "level": level,
        "factors": factors,
        "context": {
            "n_readings": n,
            "n_crisis_events": n_events,
            "avg_stress": int(avg_stress),
            "avg_crisis_prob": int(avg_crisis_prob),
            "dominant_emotion": dominant_emotion,
            "volatility": int(volatility),
            "neg_share_recent": round(neg_share, 2),
            "window_days": WINDOW_DAYS,
            "recent_days": RECENT_DAYS,
        },
    }


# ---------------------------------------------------------------------------
# Suggested actions (deterministic, severity-driven)
# ---------------------------------------------------------------------------

_ACTIONS: dict[str, list[dict]] = {
    "green": [
        {"audience": "friend", "action": "A short text checking in is plenty -- no urgency."},
        {"audience": "family", "action": "Share a brief update next time you talk; nothing alarming."},
    ],
    "amber": [
        {"audience": "friend", "action": "Reach out today. A 10-minute call helps more than a text."},
        {"audience": "family", "action": "Have an in-person or voice conversation; offer to be present."},
        {"audience": "therapist", "action": "Consider booking a session this week if you have one."},
    ],
    "red": [
        {"audience": "family", "action": "Be present today -- a call or sitting together matters."},
        {"audience": "friend", "action": "Reach out now. Stay loosely in touch through the day."},
        {"audience": "therapist", "action": "Strongly recommend booking a session this week."},
    ],
    "unknown": [
        {
            "audience": "friend",
            "action": "Not enough data yet to recommend a specific action. Keep checking in.",
        }
    ],
}


def suggested_actions(level: str) -> list[dict]:
    return _ACTIONS.get(level, _ACTIONS["unknown"])


# ---------------------------------------------------------------------------
# Gemini wellbeing report (three audience-tailored narratives)
# ---------------------------------------------------------------------------

_REPORT_PROMPT = """You are helping a MoodMirror user write three short
wellbeing summaries -- one for each audience: a close friend, family,
and a therapist. The user is speaking in first person to friend/family,
and writing a structured note about themselves to a therapist.

Severity level: {level} (composite score {score}/100 over the last 14 days).
Contributing factors (do NOT echo verbatim, weave them in):
{factors}

Context (last 14 days, last 7 days indicated where shown):
{context_json}

Return STRICT JSON, no prose, no markdown:

{{
  "for_friend":    "1st-person, casual, peer-to-peer. 2-3 sentences. No clinical words. Asks for presence, not pity.",
  "for_family":    "1st-person, warm and direct. 2-3 sentences. Culturally appropriate for an Indian family context if names suggest that, otherwise neutral. Asks for a practical form of care (a call, time together).",
  "for_therapist": "Third-person, structured, factual. 4-6 short sentences OR bullets joined with newlines. Mention dominant emotion, severity level, and notable patterns. NO direct mention of app metric names like 'crisis_probability' -- describe in plain words."
}}

Rules:
- NEVER diagnose ("you have depression / anxiety / ADHD").
- NEVER use the words 'AI', 'algorithm', 'crisis_probability', 'metrics', 'score'.
- Length-cap each at ~280 chars.
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


def _heuristic_report(severity: dict) -> dict:
    """Used when Gemini is unavailable. Honest, profile-grounded; no fiction."""
    ctx = severity.get("context") or {}
    dom = ctx.get("dominant_emotion") or "Neutral"
    avg = ctx.get("avg_stress") or 0
    n_events = ctx.get("n_crisis_events") or 0
    level = severity.get("level", "unknown")

    if level == "red":
        friend_open = "Hey -- this week's been heavy and I could really use a kind voice."
        family_open = "I've been carrying a lot this week. Can we talk soon? It would help."
    elif level == "amber":
        friend_open = "Things have been a bit much lately. A short chat would help."
        family_open = "It's been a tougher week than usual. Could we catch up soon?"
    else:
        friend_open = "Just checking in -- doing okay overall."
        family_open = "Wanted to share -- I'm doing alright, just keeping you in the loop."

    therapist_lines = [
        f"Reporting in -- last 14 days, {ctx.get('n_readings', 0)} self-check-ins.",
        f"Dominant emotion: {dom}.",
        f"Average stress around {avg}/100.",
    ]
    if n_events:
        therapist_lines.append(
            f"Logged {n_events} elevated/crisis episode{'s' if n_events != 1 else ''} in the period."
        )
    if level != "unknown":
        therapist_lines.append(f"Severity assessed as {level}.")

    return {
        "for_friend": friend_open,
        "for_family": family_open,
        "for_therapist": "\n".join(therapist_lines),
        "_degraded": True,
    }


def _call_gemini(severity: dict) -> Optional[dict]:
    if not API_KEY:
        return None

    prompt = _REPORT_PROMPT.format(
        level=severity.get("level"),
        score=severity.get("score") if severity.get("score") is not None else "N/A",
        factors="\n".join(f"- {f}" for f in (severity.get("factors") or [])) or "- (none significant)",
        context_json=json.dumps(severity.get("context") or {}, default=str),
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MODEL}:generateContent?key={API_KEY}"
    )
    payload = {
        "generationConfig": {
            "temperature": 0.5,
            "response_mime_type": "application/json",
            "maxOutputTokens": 600,
        },
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    }
    try:
        res = requests.post(url, json=payload, timeout=30)
    except Exception as e:
        print(f"[support_intel] gemini request failed: {e}")
        return None
    if res.status_code != 200:
        print(f"[support_intel] gemini http {res.status_code}: {res.text[:200]}")
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
        print(f"[support_intel] gemini parse error: {e}")
        return None


def generate_wellbeing_report(severity: dict) -> dict:
    """Returns the three audience-tailored narratives. Does NOT call
    compute_severity itself -- callers pass in the severity dict so that
    UI can show the same numbers it acted on.
    """
    if not severity.get("sufficient_data"):
        return _heuristic_report(severity)

    parsed = _call_gemini(severity)
    if not parsed:
        return _heuristic_report(severity)

    out = {
        "for_friend": str(parsed.get("for_friend") or "").strip()[:600],
        "for_family": str(parsed.get("for_family") or "").strip()[:600],
        "for_therapist": str(parsed.get("for_therapist") or "").strip()[:1200],
        "_degraded": False,
    }
    # Backfill any empty section from the heuristic to guarantee shape.
    fallback = _heuristic_report(severity)
    for k in ("for_friend", "for_family", "for_therapist"):
        if not out[k]:
            out[k] = fallback[k]
            out["_degraded"] = True
    return out


# ---------------------------------------------------------------------------
# Public composer
# ---------------------------------------------------------------------------

def get_support_report(uid: str) -> dict:
    severity = compute_severity(uid)
    actions = suggested_actions(severity.get("level", "unknown"))
    summary = generate_wellbeing_report(severity)
    return {
        "severity": severity,
        "summary": summary,
        "suggested_actions": actions,
    }
