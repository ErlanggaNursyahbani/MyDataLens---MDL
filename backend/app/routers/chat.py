from typing import Any

import pandas as pd
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
    all_rows: list[dict[str, Any]] | None = None
    history: list[ChatMessage]
    provider: str
    api_key: str


class ChatResponse(BaseModel):
    reply: str


def _compute_stats_text(all_rows: list[dict[str, Any]], schema: list[ColumnInfo]) -> str:
    """Compute column stats from all rows using Pandas and format as natural language."""
    if not all_rows:
        return ""
    df = pd.DataFrame(all_rows)
    row_count = len(df)
    lines = [
        f"SYSTEM-COMPUTED STATISTICS — calculated by the server from ALL {row_count} rows:",
        "Report these exact values for aggregate questions. Do not compute from sample rows.\n",
    ]
    for col_info in schema:
        col = col_info.name
        dtype = col_info.dtype
        if col not in df.columns:
            continue
        if dtype in ("integer", "float"):
            series = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(series) == 0:
                continue
            total = series.sum()
            mean = series.mean()
            min_v = series.min()
            max_v = series.max()
            lines.append(
                f"- {col}: total={total:,.4g} | average={mean:,.4g}"
                f" | min={min_v:,.4g} | max={max_v:,.4g} | count={len(series)}"
            )
        elif dtype == "string":
            unique = df[col].nunique()
            top5 = df[col].value_counts().head(5)
            top_str = " | ".join(f"{v}={c}" for v, c in top5.items())
            lines.append(f"- {col}: {unique} unique values | top 5 by frequency: {top_str}")
    return "\n".join(lines)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the AI about the dataset and get a reply."""
    schema = [{"name": col.name, "dtype": col.dtype} for col in request.columns]
    history = [{"role": msg.role, "content": msg.content} for msg in request.history]

    stats_text = _compute_stats_text(request.all_rows, request.columns) if request.all_rows else None

    try:
        reply = await chat_with_data(
            provider=request.provider,
            api_key=request.api_key,
            schema=schema,
            sample=request.sample,
            history=history,
            message=request.message,
            stats_text=stats_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

    return ChatResponse(reply=reply)
