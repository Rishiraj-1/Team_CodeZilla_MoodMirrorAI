"""
/api/profile routes for personalization preferences.

  GET  /profile     -- read current personalization preferences
  PUT  /profile     -- update (whitelisted, validated)
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..utils.firebase_auth import get_current_user
from ..utils import personalization as pers

router = APIRouter(prefix="/api/profile")


class ProfilePatch(BaseModel):
    language: Optional[str] = None
    culture: Optional[str] = None
    age_band: Optional[str] = None
    spirituality: Optional[str] = None


@router.get("")
@router.get("/")
def get_profile(decoded=Depends(get_current_user)):
    return pers.get_profile(decoded["uid"])


@router.put("")
@router.put("/")
def update_profile(patch: ProfilePatch, decoded=Depends(get_current_user)):
    body: dict[str, Any] = {k: v for k, v in patch.model_dump().items() if v is not None}
    return pers.set_profile(decoded["uid"], body)
