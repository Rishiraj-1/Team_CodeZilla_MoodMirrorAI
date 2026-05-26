import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes import analyze, reports, support, digital_twin, mirror, crisis
from . import database

load_dotenv()

origins = os.getenv("FRONTEND_ORIGINS", "").split(",") if os.getenv("FRONTEND_ORIGINS") else []

app = FastAPI(title="MoodMirrorAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(reports.router)
app.include_router(support.router)
app.include_router(digital_twin.router)
app.include_router(mirror.router)
app.include_router(crisis.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "MoodMirrorAI Backend"}


