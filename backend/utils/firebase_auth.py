from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

bearer = HTTPBearer()


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Missing authorization header")
    token = creds.credentials
    try:
        decoded = auth.verify_id_token(token)
        return decoded  # contains uid, email, etc.
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {str(e)}")


