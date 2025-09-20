import os
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv

# Load env from current working directory .env if present
load_dotenv()
# Also try backend/.env alongside this file to be robust to where uvicorn is started
_backend_env = Path(__file__).with_name('.env')
if _backend_env.exists():
    load_dotenv(dotenv_path=str(_backend_env))

_backend_dir = Path(__file__).parent

cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
project_id = os.getenv("FIREBASE_PROJECT_ID")
print(f"cred_path from env: {cred_path}") # Added for debugging
print(f"project_id from env: {project_id}") # Added for debugging

if not cred_path or not project_id:
    raise RuntimeError("Missing GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID in environment")

# Resolve relative credential path against backend directory if needed
cred_path_resolved = Path(cred_path)
if not cred_path_resolved.is_absolute():
    candidate = _backend_dir / cred_path
    if candidate.exists():
        cred_path_resolved = candidate
print(f"cred_path_resolved: {cred_path_resolved}") # Added for debugging

if not cred_path_resolved.exists():
    raise RuntimeError(f"Service account file not found at: {cred_path_resolved}")

# Initialize Firebase app only once
if not firebase_admin._apps:
    cred = credentials.Certificate(str(cred_path_resolved))
    db_url_env = os.getenv("FIREBASE_DB_URL")
    database_url = db_url_env or f"https://{project_id}.firebaseio.com"
    firebase_admin.initialize_app(cred, {
        "databaseURL": database_url
    })

rt_db = db
