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

# In-memory store: batch_id → metadata
_batch_store: dict[str, dict[str, Any]] = {}

_BATCH_SYSTEM_PROMPT = (
    "You are a data processing assistant. Apply the given task to the input text. "
    "Respond with only the result — no explanation, no preamble."
)


def _build_system_prompt(role_persona: str | None) -> str:
    """Prepend optional role/persona to the base system prompt."""
    if role_persona and role_persona.strip():
        return f"{role_persona.strip()}\n\n{_BATCH_SYSTEM_PROMPT}"
    return _BATCH_SYSTEM_PROMPT

_ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


# ── Pydantic models ─────────────────────────────────────────────────────────────


class TaskSpec(BaseModel):
    task_description: str
    output_column_name: str


class BatchPreviewRequest(BaseModel):
    column: str
    tasks: list[TaskSpec]
    rows: list[str]
    identity_values: list[str]
    provider: str
    api_key: str
    role_persona: str | None = None


class PreviewRow(BaseModel):
    identity: str
    input: str
    ai_outputs: dict[str, str]  # output_column_name → result


class BatchPreviewResponse(BaseModel):
    preview: list[PreviewRow]


class BatchSubmitRequest(BaseModel):
    column: str
    tasks: list[TaskSpec]
    rows: list[str]
    provider: str
    api_key: str
    identity_column: str | None = None
    identity_values: list[str] | None = None
    all_rows: list[dict[str, Any]] | None = None
    role_persona: str | None = None


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


def _make_csv_raw(
    label: str,
    label_values: list[str],
    results: dict[int, dict[int, str]],
    task_specs: list[TaskSpec],
) -> str:
    """CSV: identity/input column + one output column per task."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([label, *[s.output_column_name for s in task_specs]])
    for i, val in enumerate(label_values):
        row_r = results.get(i, {})
        writer.writerow([val, *[row_r.get(t, "") for t in range(len(task_specs))]])
    return buf.getvalue()


def _make_csv_merged(
    all_rows: list[dict[str, Any]],
    results: dict[int, dict[int, str]],
    task_specs: list[TaskSpec],
) -> str:
    """CSV: all original columns + one output column per task appended."""
    if not all_rows:
        return ""
    buf = io.StringIO()
    output_cols = [s.output_column_name for s in task_specs]
    fieldnames = list(all_rows[0].keys()) + output_cols
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for i, row in enumerate(all_rows):
        safe_row = {k: ("" if v is None else v) for k, v in row.items()}
        row_r = results.get(i, {})
        extras = {s.output_column_name: row_r.get(t, "") for t, s in enumerate(task_specs)}
        writer.writerow({**safe_row, **extras})
    return buf.getvalue()


# ── OpenAI helpers ────────────────────────────────────────────────────────────


async def _preview_openai(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> list[list[str]]:
    """Run sample rows through OpenAI for each task. Returns [task_idx][row_idx]."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    system_prompt = _build_system_prompt(role_persona)
    all_results: list[list[str]] = []
    for task_spec in tasks:
        task_results: list[str] = []
        for row in rows:
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": _user_content(task_spec.task_description, column, row)},
                ],
                max_tokens=500,
            )
            task_results.append(resp.choices[0].message.content or "")
        all_results.append(task_results)
    return all_results


async def _submit_openai(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> str:
    """Upload JSONL with all task×row combinations and create one OpenAI batch job."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    system_prompt = _build_system_prompt(role_persona)
    lines = [
        json.dumps(
            {
                "custom_id": f"row_{r}_task_{t}",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": _user_content(task_spec.task_description, column, row)},
                    ],
                    "max_tokens": 500,
                },
            },
            ensure_ascii=False,
        )
        for r, row in enumerate(rows)
        for t, task_spec in enumerate(tasks)
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


async def _get_results_openai(
    api_key: str, batch_id: str
) -> dict[int, dict[int, str]]:
    """Download OpenAI batch output; return {row_idx: {task_idx: result}}."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    batch = await client.batches.retrieve(batch_id)

    if batch.status != "completed":
        raise ValueError(f"Batch status is '{batch.status}', not completed yet")
    if not batch.output_file_id:
        raise ValueError("No output file available for this batch")

    file_resp = await client.files.content(batch.output_file_id)
    raw = await file_resp.aread()

    results: dict[int, dict[int, str]] = {}
    for line in raw.decode("utf-8").strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            cid: str = obj.get("custom_id", "")
            if cid.startswith("row_") and "_task_" in cid:
                r_part, t_part = cid.split("_task_", 1)
                r = int(r_part[4:])
                t = int(t_part)
                text: str = obj["response"]["body"]["choices"][0]["message"]["content"]
                results.setdefault(r, {})[t] = text
        except (KeyError, IndexError, ValueError, json.JSONDecodeError):
            pass

    return results


# ── Anthropic helpers ─────────────────────────────────────────────────────────


def _preview_anthropic_sync(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> list[list[str]]:
    """Run sample rows through Anthropic for each task. Returns [task_idx][row_idx]."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _build_system_prompt(role_persona)
    all_results: list[list[str]] = []
    for task_spec in tasks:
        task_results: list[str] = []
        for row in rows:
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                system=system_prompt,
                messages=[{"role": "user", "content": _user_content(task_spec.task_description, column, row)}],
            )
            task_results.append(resp.content[0].text if resp.content else "")
        all_results.append(task_results)
    return all_results


async def _preview_anthropic(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> list[list[str]]:
    return await asyncio.to_thread(_preview_anthropic_sync, api_key, column, tasks, rows, role_persona)


def _submit_anthropic_sync(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> str:
    """Create one Anthropic Message Batch with all task×row combinations."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _build_system_prompt(role_persona)
    requests = [
        {
            "custom_id": f"row_{r}_task_{t}",
            "params": {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 500,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": _user_content(task_spec.task_description, column, row)}
                ],
            },
        }
        for r, row in enumerate(rows)
        for t, task_spec in enumerate(tasks)
    ]
    batch = client.beta.messages.batches.create(requests=requests)
    return batch.id


async def _submit_anthropic(
    api_key: str, column: str, tasks: list[TaskSpec], rows: list[str],
    role_persona: str | None = None,
) -> str:
    return await asyncio.to_thread(_submit_anthropic_sync, api_key, column, tasks, rows, role_persona)


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
    status = "completed" if batch.processing_status == "ended" else "processing"

    return {
        "status": status,
        "total": total,
        "completed": counts.succeeded,
        "failed_count": counts.errored + counts.canceled + counts.expired,
    }


async def _status_anthropic(api_key: str, batch_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_status_anthropic_sync, api_key, batch_id)


def _get_results_anthropic_sync(
    api_key: str, batch_id: str
) -> dict[int, dict[int, str]]:
    """Stream Anthropic batch results; return {row_idx: {task_idx: result}}."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    batch = client.beta.messages.batches.retrieve(batch_id)
    if batch.processing_status != "ended":
        raise ValueError(f"Batch is still '{batch.processing_status}', not ended yet")

    results: dict[int, dict[int, str]] = {}
    for result in client.beta.messages.batches.results(batch_id):
        cid = result.custom_id
        if not (cid.startswith("row_") and "_task_" in cid):
            continue
        try:
            r_part, t_part = cid.split("_task_", 1)
            r = int(r_part[4:])
            t = int(t_part)
        except ValueError:
            continue

        if result.result.type == "succeeded":
            content = result.result.message.content
            text = content[0].text if content else ""
        else:
            text = f"[{result.result.type}]"
        results.setdefault(r, {})[t] = text

    return results


async def _get_results_anthropic(
    api_key: str, batch_id: str
) -> dict[int, dict[int, str]]:
    return await asyncio.to_thread(_get_results_anthropic_sync, api_key, batch_id)


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


@router.post("/preview", response_model=BatchPreviewResponse)
async def preview_batch(request: BatchPreviewRequest) -> BatchPreviewResponse:
    """Run up to 3 sample rows through the regular AI API for each task, returning a multi-column preview."""
    if request.provider in ("gemini", "groq"):
        raise HTTPException(
            status_code=400,
            detail="Preview not supported for this provider",
        )
    if not request.rows:
        raise HTTPException(status_code=400, detail="No rows provided for preview")
    if not request.tasks:
        raise HTTPException(status_code=400, detail="No tasks provided for preview")

    n = min(3, len(request.rows))
    sample_rows = request.rows[:n]
    sample_ids = list(request.identity_values[:n])
    while len(sample_ids) < n:
        sample_ids.append("")

    try:
        if request.provider == "openai":
            # outputs_by_task[task_idx][row_idx]
            outputs_by_task = await _preview_openai(
                request.api_key, request.column, request.tasks, sample_rows, request.role_persona
            )
        elif request.provider == "anthropic":
            outputs_by_task = await _preview_anthropic(
                request.api_key, request.column, request.tasks, sample_rows, request.role_persona
            )
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown provider: {request.provider!r}"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Preview failed: {exc}") from exc

    preview = [
        PreviewRow(
            identity=sample_ids[i],
            input=sample_rows[i],
            ai_outputs={
                request.tasks[t].output_column_name: outputs_by_task[t][i]
                for t in range(len(request.tasks))
            },
        )
        for i in range(n)
    ]
    return BatchPreviewResponse(preview=preview)


@router.post("/submit", response_model=BatchSubmitResponse)
async def submit_batch(request: BatchSubmitRequest) -> BatchSubmitResponse:
    """Submit one batch AI processing job containing all task×row combinations."""
    if request.provider in ("gemini", "groq"):
        raise HTTPException(
            status_code=400,
            detail="Batch not supported for this provider",
        )
    if not request.rows:
        raise HTTPException(status_code=400, detail="No rows provided")
    if not request.tasks:
        raise HTTPException(status_code=400, detail="No tasks provided")

    try:
        if request.provider == "openai":
            batch_id = await _submit_openai(
                request.api_key, request.column, request.tasks, request.rows, request.role_persona
            )
        elif request.provider == "anthropic":
            batch_id = await _submit_anthropic(
                request.api_key, request.column, request.tasks, request.rows, request.role_persona
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
        "tasks": [{"task_description": s.task_description, "output_column_name": s.output_column_name} for s in request.tasks],
        "rows": request.rows,
        "identity_column": request.identity_column,
        "identity_values": request.identity_values or [],
        "all_rows": request.all_rows or [],
        "role_persona": request.role_persona,
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
    mode: Annotated[str, Query()] = "raw",
) -> StreamingResponse:
    """Download completed batch results as CSV.

    mode=raw    → identity_column + one output column per task
    mode=merged → all original columns + one output column per task
    """
    stored = _batch_store.get(batch_id)
    if not stored:
        raise HTTPException(
            status_code=404,
            detail="Batch metadata not found — results are unavailable after a server restart",
        )

    if mode not in ("raw", "merged"):
        raise HTTPException(status_code=400, detail="mode must be 'raw' or 'merged'")

    task_specs = [
        TaskSpec(task_description=t["task_description"], output_column_name=t["output_column_name"])
        for t in stored.get("tasks", [])
    ]

    try:
        if provider == "openai":
            results = await _get_results_openai(api_key, batch_id)
        elif provider == "anthropic":
            results = await _get_results_anthropic(api_key, batch_id)
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

    if mode == "merged" and stored.get("all_rows"):
        csv_text = _make_csv_merged(stored["all_rows"], results, task_specs)
        suffix = "merged"
    else:
        if stored.get("identity_column") and stored.get("identity_values"):
            label = stored["identity_column"]
            label_values = stored["identity_values"]
        else:
            label = stored["column"]
            label_values = stored["rows"]
        csv_text = _make_csv_raw(label, label_values, results, task_specs)
        suffix = "raw"

    filename = f"batch_{suffix}_{batch_id[:8]}.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
