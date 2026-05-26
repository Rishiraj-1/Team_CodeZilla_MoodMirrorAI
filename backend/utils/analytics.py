"""
Analytics
---------
Historical slices of the same time-series the Engine + Crisis modules
populate. Strictly deterministic -- no Gemini in this module. Analytics
should be trustworthy numbers, not narrative.

Output shape (top level of get_analytics):

  {
    "window_days": int,
    "n_readings": int,
    "sufficient_data": bool,

    "weekly_resilience": [{ "week_start": iso, "score": int|null, "samples": int }],
    "heatmap":            [[float|null x 24] x 7],   // [day_of_week][hour]
    "heatmap_max":        float,                     // for color scaling
    "mirror_effectiveness": {
      "samples":     int,    // number of chats with usable readings
      "avg_drop":    float,  // mean (pre - post) stress, positive = stress reduced
      "min_drop":    float,
      "max_drop":    float,
      "method":      "+/-6h window mean"
    } | null,
    "emotion_shift": {
      "this_week":   { "Happy": pct, ... },
      "last_week":   { "Happy": pct, ... },
      "delta":       { "Happy": pct_pts, ... }      // this - last
    },
    "crisis_per_day": [{ "date": iso, "count": int }],
    "recovery_time_minutes": {
      "median_min": float|null,
      "samples":    int      // number of recovery cycles measured
    }
  }
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..database import rt_db
from .digital_twin import _parse_iso, _resilience_score, MIN_READINGS


WINDOW_DAYS_DEFAULT = 28


# ---------------------------------------------------------------------------
# Loaders (window-aware, chronological)
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _load_in_window(path: str, days: int) -> list[dict]:
    try:
        data = rt_db.reference(path).get()
    except Exception as e:
        print(f"[analytics] load {path} failed: {e}")
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
# Components
# ---------------------------------------------------------------------------

def _weekly_resilience(
    readings: list[dict], crisis_events: list[dict], *, weeks: int = 4
) -> list[dict]:
    """Bucket the last N weeks (Mon-Sun) and compute resilience per bucket."""
    today = _now_utc().date()
    # Walk back to most recent Monday so weeks align to ISO weeks.
    monday = today - timedelta(days=today.weekday())
    buckets: list[tuple[datetime, datetime]] = []
    for i in range(weeks - 1, -1, -1):
        start = monday - timedelta(days=7 * i)
        end = start + timedelta(days=7)
        buckets.append(
            (
                datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc),
            )
        )

    out: list[dict] = []
    for start, end in buckets:
        wk_readings = [r for r in readings if start <= r["_dt"] < end]
        wk_events = [e for e in crisis_events if start <= e["_dt"] < end]

        n = len(wk_readings)
        if n == 0:
            out.append({"week_start": start.date().isoformat(), "score": None, "samples": 0})
            continue

        stress = [
            float((r.get("metrics") or {}).get("stress_score", 0))
            for r in wk_readings
            if isinstance((r.get("metrics") or {}).get("stress_score"), (int, float))
        ]
        avg_stress = sum(stress) / len(stress) if stress else 0.0

        # Recovery speed in this week only
        drops = []
        for i, s in enumerate(stress[:-1]):
            if s >= 70:
                drops.append(s - stress[i + 1])
        recovery = sum(drops) / len(drops) if drops else None

        crisis_count = sum(1 for e in wk_events if e.get("level") in ("elevated", "crisis"))
        # Streak within this week, capped at 7
        days_with = {r["_dt"].date() for r in wk_readings}
        streak = len(days_with)

        score = _resilience_score(
            avg_stress=avg_stress,
            recovery=recovery,
            crisis_count=crisis_count,
            streak=streak,
            n_readings=n,
        )
        out.append({"week_start": start.date().isoformat(), "score": score, "samples": n})
    return out


def _heatmap(readings: list[dict]) -> tuple[list[list[Optional[float]]], float]:
    """Returns (grid[7][24] of avg stress or None, max_value_for_scaling)."""
    sums: list[list[float]] = [[0.0] * 24 for _ in range(7)]
    counts: list[list[int]] = [[0] * 24 for _ in range(7)]
    for r in readings:
        m = r.get("metrics") or {}
        s = m.get("stress_score")
        if not isinstance(s, (int, float)):
            continue
        dt = r["_dt"].astimezone(timezone.utc)
        # Monday = 0 .. Sunday = 6 (Python convention)
        dow = dt.weekday()
        hr = dt.hour
        sums[dow][hr] += float(s)
        counts[dow][hr] += 1

    grid: list[list[Optional[float]]] = [[None] * 24 for _ in range(7)]
    mx = 0.0
    for d in range(7):
        for h in range(24):
            if counts[d][h] > 0:
                v = round(sums[d][h] / counts[d][h], 1)
                grid[d][h] = v
                if v > mx:
                    mx = v
    return grid, mx


def _mirror_effectiveness(uid: str, readings: list[dict], days: int) -> Optional[dict]:
    """For each Mirror user-turn, compute (avg pre stress) - (avg post stress).

    Only counts a chat if there is at least one reading in BOTH the 6h
    window before and the 6h window after. Otherwise we don't have real
    pre/post evidence and we skip it.
    """
    chats = _load_in_window(f"mirror_sessions/{uid}/messages", days)
    user_chats = [c for c in chats if c.get("role") == "user"]
    if not user_chats or not readings:
        return None

    deltas: list[float] = []
    window = timedelta(hours=6)

    for c in user_chats:
        c_dt = c["_dt"]
        pre = [
            (r.get("metrics") or {}).get("stress_score")
            for r in readings
            if c_dt - window <= r["_dt"] < c_dt
        ]
        post = [
            (r.get("metrics") or {}).get("stress_score")
            for r in readings
            if c_dt < r["_dt"] <= c_dt + window
        ]
        pre = [float(x) for x in pre if isinstance(x, (int, float))]
        post = [float(x) for x in post if isinstance(x, (int, float))]
        if not pre or not post:
            continue
        deltas.append((sum(pre) / len(pre)) - (sum(post) / len(post)))

    if not deltas:
        return None

    return {
        "samples": len(deltas),
        "avg_drop": round(sum(deltas) / len(deltas), 1),
        "min_drop": round(min(deltas), 1),
        "max_drop": round(max(deltas), 1),
        "method": "+/-6h window mean",
    }


def _emotion_shift(readings: list[dict]) -> dict:
    """% of time per emotion: last 7d ('this_week') vs the 7d before that."""
    now = _now_utc()
    this_start = now - timedelta(days=7)
    last_start = now - timedelta(days=14)

    this_week = [r for r in readings if r["_dt"] >= this_start]
    last_week = [r for r in readings if last_start <= r["_dt"] < this_start]

    def pct_dist(rs: list[dict]) -> dict[str, float]:
        if not rs:
            return {}
        c = Counter(r.get("emotion") or "Neutral" for r in rs)
        total = sum(c.values())
        return {k: round(v / total * 100, 1) for k, v in c.items()}

    this_pct = pct_dist(this_week)
    last_pct = pct_dist(last_week)
    keys = set(this_pct) | set(last_pct)
    delta = {k: round(this_pct.get(k, 0) - last_pct.get(k, 0), 1) for k in keys}

    return {"this_week": this_pct, "last_week": last_pct, "delta": delta}


def _crisis_per_day(events: list[dict], days: int) -> list[dict]:
    today = _now_utc().date()
    counts: dict = defaultdict(int)
    for e in events:
        if e.get("level") in ("elevated", "crisis"):
            counts[e["_dt"].date()] += 1
    out = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        out.append({"date": d.isoformat(), "count": counts.get(d, 0)})
    return out


def _recovery_time(readings: list[dict]) -> dict:
    """Median minutes from a stress peak (>=70) to the next reading <50.

    Returns:
      { "median_min": float | None, "samples": int }

    Skips peaks that never recover within the window. We don't pad with
    fake "recovered eventually" -- that would lie about real persistent
    distress.
    """
    if len(readings) < 2:
        return {"median_min": None, "samples": 0}

    durations: list[float] = []
    i = 0
    while i < len(readings):
        m = (readings[i].get("metrics") or {}).get("stress_score")
        if isinstance(m, (int, float)) and m >= 70:
            peak_dt = readings[i]["_dt"]
            recovered = False
            for j in range(i + 1, len(readings)):
                mj = (readings[j].get("metrics") or {}).get("stress_score")
                if isinstance(mj, (int, float)) and mj < 50:
                    delta_min = (readings[j]["_dt"] - peak_dt).total_seconds() / 60
                    durations.append(round(delta_min, 1))
                    i = j
                    recovered = True
                    break
            if not recovered:
                # Never recovered within the window -- skip this peak.
                pass
        i += 1

    if not durations:
        return {"median_min": None, "samples": 0}

    return {"median_min": round(statistics.median(durations), 1), "samples": len(durations)}


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def get_analytics(uid: str, *, days: int = WINDOW_DAYS_DEFAULT) -> dict:
    days = max(7, min(days, 90))
    readings = _load_in_window(f"readings/{uid}", days)
    crisis_events = _load_in_window(f"crisis_events/{uid}", days)

    n = len(readings)
    if n < MIN_READINGS:
        return {
            "window_days": days,
            "n_readings": n,
            "sufficient_data": False,
            "min_required": MIN_READINGS,
        }

    grid, hmax = _heatmap(readings)

    return {
        "window_days": days,
        "n_readings": n,
        "sufficient_data": True,
        "weekly_resilience": _weekly_resilience(readings, crisis_events, weeks=4),
        "heatmap": grid,
        "heatmap_max": hmax,
        "mirror_effectiveness": _mirror_effectiveness(uid, readings, days),
        "emotion_shift": _emotion_shift(readings),
        "crisis_per_day": _crisis_per_day(crisis_events, days),
        "recovery_time_minutes": _recovery_time(readings),
    }
