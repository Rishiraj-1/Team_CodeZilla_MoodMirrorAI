from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime
from ..utils.firebase_auth import get_current_user
from ..utils import support_intel
from ..database import rt_db

router = APIRouter(prefix="/api/support")


class Contact(BaseModel):
    name: str
    phone: str


@router.post("/add")
def add_contact(contact: Contact, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    ref = rt_db.reference(f"support/{uid}")
    new_ref = ref.push({
        "name": contact.name,
        "phone": contact.phone,
        "created_at": datetime.utcnow().isoformat(),
    })
    return {"id": new_ref.key, "status": "added"}


@router.get("/me")
def get_contacts(decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    ref = rt_db.reference(f"support/{uid}")
    return ref.get() or {}


@router.delete("/{contact_id}")
def delete_contact(contact_id: str, decoded=Depends(get_current_user)):
    uid = decoded["uid"]
    ref = rt_db.reference(f"support/{uid}/{contact_id}")
    ref.delete()
    return {"id": contact_id, "status": "deleted"}


# ---- Smart Support Network -------------------------------------------------

@router.get("/wellbeing-report")
def wellbeing_report(decoded=Depends(get_current_user)):
    """Severity score + audience-tailored narratives + suggested actions.

    Composed of:
      - severity:           deterministic 0..100 score with factors
      - summary:            three Gemini-written narratives
                            (for_friend / for_family / for_therapist)
      - suggested_actions:  list[{audience, action}]
    """
    uid = decoded["uid"]
    return support_intel.get_support_report(uid)


