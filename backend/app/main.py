import os
import sys

# Add vendored LLM packages when they are not in the venv (e.g. root-owned venv)
_vendor = os.path.join(os.path.dirname(__file__), "..", "..", "vendor")
if os.path.isdir(_vendor) and _vendor not in sys.path:
    sys.path.insert(0, os.path.abspath(_vendor))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analyze, batch, chat, merge, upload

app = FastAPI(title="MyDataLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(analyze.router)
app.include_router(chat.router)
app.include_router(batch.router)
app.include_router(merge.router)


@app.get("/health")
def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "MyDataLens API"}
