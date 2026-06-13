import asyncio
import csv
import io
import json
from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/batch", tags=["batch"])

# In-memory store: provider_batch_id → { column, task, rows, provider }
_batch_store: dict[str, dict[str, Any]] = {}

_BATCH_SYSTEM_PROMPT = (
    "You are a data processing assistant. Apply the given task to the input text. "
    "Respond with only the result — no explanation, no preamble."
)

_ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


# ── Pydantic models ─────────────────────────────────────────────────────────────


class BatchSubmitRequest(BaseModel):
    column: str
    task: str
    rows: list[str]
    provider: str
    api_key: str


class BatchSubmitResponse(BaseModel):
    batch_id: str
    provider: str
    status: str


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str
    total: int
    completed: int
    failed_count: int
    error: str | None = None


class ExtractColumnResponse(BaseModel):
    values: list[str]
    count: int


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _user_content(task: str, column: str, row: str) -> str:
    """Build the per-row prompt content."""
    return f"Task: {task}\n\nInput ({column}): {row}"


def _make_csv(column: str, rows: list[str], results: dict[int, str]) -> str:
    """Build a CSV string with the original rows and AI results."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([column, "ai_result"])
    for i, row in enumerate(rows):
        writer.writerow([row, results.get(i, "")])
    return buf.getvalue()


# ── OpenAI batch ────────────────────────────────────────────────────────────────


async def _submit_openai(api_key: str, column: str, task: str, rows: list[str]) -> str:
    """Upload JSONL file and create an OpenAI batch job. Returns the batch ID."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    lines = [
        json.dumps(
            {
                "custom_id": f"row_{i}",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": _BATCH_SYSTEM_PROMPT},
                        {"role": "user", "content": _user_content(task, column, row)},
                    ],
                    "max_tokens": 500,
                },
            },
            ensure_ascii=False,
        )
        for i, row in enumerate(rows)
    ]
    jsonl_bytes = "\n".join(lines).encode("utf-8")

    file_obj = await client.files.create(
        file=("batch_input.jsonl", io.BytesIO(jsonl_bytes), "application/jsonlines"),
        purpose="batch",
    )
    batch = await client.batches.create(
        input_file_id=file_obj.id,
        endpoint="/v1/chat/completions",
        completion_window="24h",
    )
    return batch.id


async def _status_openai(api_key: str, batch_id: str) -> dict[str, Any]:
    """Retrieve batch status from OpenAI and normalise to our status vocabulary."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    batch = await client.batches.retrieve(batch_id)

    _map = {
        "validating": "queued",
        "in_progress": "processing",
        "finalizing": "processing",
        "completed": "completed",
        "failed": "failed",
        "expired": "failed",
        "cancelling": "processing",
        "cancelled": "failed",
    }
    counts = batch.request_counts
    return {
        "status": _map.get(batch.status, "processing"),
        "total": counts.total,
        "completed": counts.completed,
        "failed_count": counts.failed,
    }


async def _download_openai(
    api_key: str, batch_id: str, rows: list[str], column: str
) -> str:
    """Download and parse OpenAI batch output; return CSV text."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    batch = await client.batches.retrieve(batch_id)

    if batch.status != "completed":
        raise ValueError(f"Batch status is '{batch.status}', not completed yet")
    if not batch.output_file_id:
        raise ValueError("No output file available for this batch")

    file_resp = await client.files.content(batch.output_file_id)
    raw = await file_resp.aread()

    results: dict[int, str] = {}
    for line in raw.decode("utf-8").strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            cid: str = obj.get("custom_id", "")
            if cid.startswith("row_"):
                idx = int(cid[4:])
                text: str = obj["response"]["body"]["choices"][0]["message"]["content"]
                results[idx] = text
        except (KeyError, IndexError, ValueError, json.JSONDecodeError):
            pass

    return _make_csv(column, rows, results)


# ── Anthropic batch (sync wrapped in thread) ────────────────────────────────────


def _submit_anthropic_sync(api_key: str, column: str, task: str, rows: list[str]) -> str:
    """Create an Anthropic Message Batch. Returns the batch ID."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    requests = [
        {
            "custom_id": f"row_{i}",
            "params": {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 500,
                "messages": [
                    {"role": "user", "content": _user_content(task, column, row)}
                ],
            },
        }
        for i, row in enumerate(rows)
    ]
    batch = client.beta.messages.batches.create(requests=requests)
    return batch.id


async def _submit_anthropic(api_key: str, column: str, task: str, rows: list[str]) -> str:
    return await asyncio.to_thread(_submit_anthropic_sync, api_key, column, task, rows)


def _status_anthropic_sync(api_key: str, batch_id: str) -> dict[str, Any]:
    """Retrieve Anthropic batch status and normalise to our status vocabulary."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    batch = client.beta.messages.batches.retrieve(batch_id)
    counts = batch.request_counts

    total = (
        counts.processing
        + counts.succeeded
        + counts.errored
        + counts.canceled
        + counts.expired
    )
    # processing_status is "in_progress" | "canceling" | "ended"
    status = "completed" if batch.processing_status == "ended" else "processing"

    return {
        "status": status,
        "total": total,
        "completed": counts.succeeded,
        "failed_count": counts.errored + counts.canceled + counts.expired,
    }


async def _status_anthropic(api_key: str, batch_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_status_anthropic_sync, api_key, batch_id)


def _download_anthropic_sync(
    api_key: str, batch_id: str, rows: list[str], column: str
) -> str:
    """Stream Anthropic batch results and return CSV text."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    batch = client.beta.messages.batches.retrieve(batch_id)
    if batch.processing_status != "ended":
        raise ValueError(f"Batch is still '{batch.processing_status}', not ended yet")

    results: dict[int, str] = {}
    for result in client.beta.messages.batches.results(batch_id):
        cid = result.custom_id
        if not cid.startswith("row_"):
            continue
        try:
            idx = int(cid[4:])
        except ValueError:
            continue

        if result.result.type == "succeeded":
            content = result.result.message.content
            text = content[0].text if content else ""
        else:
            text = f"[{result.result.type}]"
        results[idx] = text

    return _make_csv(column, rows, results)


async def _download_anthropic(
    api_key: str, batch_id: str, rows: list[str], column: str
) -> str:
    return await asyncio.to_thread(
        _download_anthropic_sync, api_key, batch_id, rows, column
    )


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.post("/extract-column", response_model=ExtractColumnResponse)
async def extract_column(
    file: UploadFile = File(...),
    column: str = Form(...),
) -> ExtractColumnResponse:
    """Extract all values from a specific column in an uploaded CSV or Excel file."""
    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: .csv, .xlsx, .xls",
        )

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content)) if ext == ".csv" else pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {exc}") from exc

    if column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column '{column}' not found. Available: {list(df.columns)}",
        )

    values = df[column].fillna("").astype(str).tolist()
    return ExtractColumnResponse(values=values, count=len(values))


@router.post("/submit", response_model=BatchSubmitResponse)
async def submit_batch(request: BatchSubmitRequest) -> BatchSubmitResponse:
    """Submit a batch AI processing job to the specified provider."""
    if request.provider in ("gemini", "groq"):
        raise HTTPException(
            status_code=400,
            detail="Batch not supported for this provider",
        )
    if not request.rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    try:
        if request.provider == "openai":
            batch_id = await _submit_openai(
                request.api_key, request.column, request.task, request.rows
            )
        elif request.provider == "anthropic":
            batch_id = await _submit_anthropic(
                request.api_key, request.column, request.task, request.rows
            )
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown provider: {request.provider!r}"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Batch submission failed: {exc}"
        ) from exc

    _batch_store[batch_id] = {
        "provider": request.provider,
        "column": request.column,
        "task": request.task,
        "rows": request.rows,
    }
    return BatchSubmitResponse(
        batch_id=batch_id, provider=request.provider, status="submitted"
    )


@router.get("/status/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(
    batch_id: str,
    provider: Annotated[str, Query()],
    api_key: Annotated[str, Query()],
) -> BatchStatusResponse:
    """Check the status of a submitted batch job."""
    if provider in ("gemini", "groq"):
        raise HTTPException(
            status_code=400,
            detail="Batch not available for this provider",
        )
    try:
        if provider == "openai":
            info = await _status_openai(api_key, batch_id)
        elif provider == "anthropic":
            info = await _status_anthropic(api_key, batch_id)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown provider: {provider!r}"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Status check failed: {exc}"
        ) from exc

    return BatchStatusResponse(
        batch_id=batch_id,
        status=info["status"],
        total=info["total"],
        completed=info["completed"],
        failed_count=info["failed_count"],
    )


@router.get("/download/{batch_id}")
async def download_batch_results(
    batch_id: str,
    provider: Annotated[str, Query()],
    api_key: Annotated[str, Query()],
) -> StreamingResponse:
    """Download completed batch results as a CSV file.

    Requires the job to have been submitted in the current server session
    (row data is stored in-memory and lost on restart).
    """
    stored = _batch_store.get(batch_id)
    if not stored:
        raise HTTPException(
            status_code=404,
            detail="Batch metadata not found — results are unavailable after a server restart",
        )

    try:
        if provider == "openai":
            csv_text = await _download_openai(
                api_key, batch_id, stored["rows"], stored["column"]
            )
        elif provider == "anthropic":
            csv_text = await _download_anthropic(
                api_key, batch_id, stored["rows"], stored["column"]
            )
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported provider: {provider!r}"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Download failed: {exc}"
        ) from exc

    filename = f"batch_results_{batch_id[:8]}.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
