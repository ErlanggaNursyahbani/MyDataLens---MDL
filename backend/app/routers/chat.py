from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.providers import chat_with_data

router = APIRouter(prefix="/chat", tags=["chat"])


class ColumnInfo(BaseModel):
    name: str
    dtype: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    columns: list[ColumnInfo]
    sample: list[dict[str, Any]]
    history: list[ChatMessage]
    provider: str
    api_key: str
    dataset_stats: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the AI about the dataset and get a reply."""
    schema = [{"name": col.name, "dtype": col.dtype} for col in request.columns]
    history = [{"role": msg.role, "content": msg.content} for msg in request.history]

    try:
        reply = await chat_with_data(
            provider=request.provider,
            api_key=request.api_key,
            schema=schema,
            sample=request.sample,
            history=history,
            message=request.message,
            dataset_stats=request.dataset_stats,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

    return ChatResponse(reply=reply)
