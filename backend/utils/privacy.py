"""
Privacy + Ethics layer.

Three things in one module:

  1. Consent preferences -- per-user flags that gate what the rest of
     the system records.
  2. Data export -- a single JSON dump of every path we've written for
     the user.
  3. Data delete -- a best-effort wipe of every user-owned path.

Other modules MUST consult `get_consent(uid)` before persisting:

  - emotion_engine.analyze()
      * skips a modality entirely if its allow_* flag is off
      * skips raw text in the legacy reports/{uid} mirror if
        allow_text_storage is off

  - mirror.chat()
      * skips message persistence if allow_mirror_history is off
        (the conversation still works for THIS turn -- it just won't
        be remembered)

  - crisis.log_event()
      * skips persistence if allow_crisis_log is off
        (the classifier still RUNS for safety -- we never gate the
        live assessment, only the audit trail)

This file owns the contract; it does NOT enforce it. Each consumer
honors the flag at the persistence boundary, on its own.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from ..database import rt_db


CONSENT_KEYS = (
    "allow_text",            # process text inputs at all
    "allow_voice",           # process voice clips
    "allow_face",            # process face frames
    "allow_text_storage",    # keep the raw text alongside metrics
    "allow_mirror_history",  # persist Mirror chats across sessions
    "allow_crisis_log",      # write crisis events to the audit trail
)

# Sensible defaults: everything ON so existing users see no change
# until they actively choose to dial things down.
DEFAULT_CONSENT: dict[str, bool] = {k: True for k in CONSENT_KEYS}


# ---------------------------------------------------------------------------
# Consent
# ---------------------------------------------------------------------------

def get_consent(uid: str) -> dict[str, bool]:
    """Always returns a complete dict -- missing keys fall back to default."""
    try:
        data = rt_db.reference(f"user_prefs/{uid}/consent").get() or {}
    except Exception as e:
        print(f"[privacy] get_consent failed: {e}")
        data = {}

    out = dict(DEFAULT_CONSENT)
    if isinstance(data, dict):
        for k in CONSENT_KEYS:
            v = data.get(k)
            if isinstance(v, bool):
                out[k] = v
    return out


def set_consent(uid: str, prefs: dict[str, Any]) -> dict[str, bool]:
    """Whitelist incoming keys, persist, return the merged result."""
    cleaned: dict[str, bool] = {}
    for k in CONSENT_KEYS:
        if k in prefs and isinstance(prefs[k], bool):
            cleaned[k] = prefs[k]
    if not cleaned:
        # Nothing to update; just return current.
        return get_consent(uid)

    payload = {**cleaned, "updated_at": datetime.utcnow().isoformat()}
    try:
        rt_db.reference(f"user_prefs/{uid}/consent").update(payload)
    except Exception as e:
        print(f"[privacy] set_consent failed: {e}")
    return get_consent(uid)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

# Every Firebase path this app writes that is uid-scoped.
# Used by both export() and delete_all_user_data().
USER_PATHS = (
    "readings",          # canonical engine output
    "reports",           # legacy mirror of engine output (raw text lives here)
    "mirror_sessions",   # Mirror chat history
    "crisis_events",     # crisis audit trail
    "support",           # trusted contacts
    "user_prefs",        # consent preferences themselves
)


def export_all(uid: str) -> dict:
    """Bundle everything we have for this user into a single dict.

    Shape:
      {
        "exported_at":  iso8601,
        "uid":          str,
        "data": {
          "<path>": <whatever Firebase has at /path/{uid}>
        }
      }
    """
    bundle: dict = {}
    for path in USER_PATHS:
        try:
            bundle[path] = rt_db.reference(f"{path}/{uid}").get() or {}
        except Exception as e:
            print(f"[privacy] export {path} failed: {e}")
            bundle[path] = {"_export_error": str(e)}

    return {
        "exported_at": datetime.utcnow().isoformat(),
        "uid": uid,
        "data": bundle,
    }


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_all_user_data(uid: str) -> dict:
    """Best-effort wipe of every user-owned path. Reports per-path status.

    We do NOT use a transaction -- Firebase RTDB doesn't support
    multi-path atomic writes that span trees here, and partial deletes
    are still better than refusing to delete because one path errored.
    """
    results: dict[str, str] = {}
    for path in USER_PATHS:
        try:
            rt_db.reference(f"{path}/{uid}").delete()
            results[path] = "deleted"
        except Exception as e:
            print(f"[privacy] delete {path} failed: {e}")
            results[path] = f"error: {e}"
    return {
        "uid": uid,
        "deleted_at": datetime.utcnow().isoformat(),
        "results": results,
    }


# ---------------------------------------------------------------------------
# Transparency log
# ---------------------------------------------------------------------------

def transparency_log(uid: str, *, limit: int = 20) -> list[dict]:
    """Most recent readings with the *reasoning* the engine produced.

    We don't store any new data for this -- we just surface what's
    already in readings/{uid} (which the Engine populates with
    explanation + metrics + crisis assessment). Showing this is the
    point of the privacy page: 'here is exactly why we said what we
    said about you.'
    """
    try:
        data = rt_db.reference(f"readings/{uid}").get()
    except Exception as e:
        print(f"[privacy] transparency_log read failed: {e}")
        return []
    if not data:
        return []

    items = []
    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        items.append(
            {
                "id": k,
                "created_at": v.get("created_at"),
                "source": v.get("source"),
                "emotion": v.get("emotion"),
                "confidence": v.get("confidence"),
                "explanation": v.get("explanation"),
                "metrics": v.get("metrics"),
                "crisis": v.get("crisis"),
                "inputs": v.get("inputs"),
            }
        )
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items[: max(1, min(limit, 100))]
