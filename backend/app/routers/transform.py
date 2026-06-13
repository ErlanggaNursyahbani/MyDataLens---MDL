import io
import re
import zipfile
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/transform", tags=["transform"])


def _apply_transform(
    all_rows: list[dict[str, Any]],
    selected_columns: list[str],
    rename_map: dict[str, str],
) -> pd.DataFrame:
    """Select and rename columns on the DataFrame."""
    if not all_rows:
        raise HTTPException(status_code=400, detail="No rows to transform.")
    if not selected_columns:
        raise HTTPException(status_code=400, detail="No columns selected.")

    try:
        df = pd.DataFrame(all_rows)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to build DataFrame: {exc}") from exc

    missing = [c for c in selected_columns if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columns not found: {missing}")

    df = df[selected_columns].copy()
    if rename_map:
        df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns and v.strip()})

    return df


class TransformPreviewRequest(BaseModel):
    all_rows: list[dict[str, Any]]
    selected_columns: list[str]
    rename_map: dict[str, str] = {}


class TransformPreviewResponse(BaseModel):
    preview_rows: list[dict[str, Any]]
    total_rows: int
    output_columns: list[str]


class TransformSplitRequest(BaseModel):
    all_rows: list[dict[str, Any]]
    selected_columns: list[str]
    rename_map: dict[str, str] = {}
    rows_per_chunk: int = 1000
    output_filename: str | None = None


@router.post("/preview", response_model=TransformPreviewResponse)
async def transform_preview(request: TransformPreviewRequest) -> TransformPreviewResponse:
    """Return first 5 rows after applying column selection + rename — no LLM."""
    df = _apply_transform(request.all_rows, request.selected_columns, request.rename_map)
    preview = df.head(5).where(pd.notnull(df.head(5)), other=None)
    return TransformPreviewResponse(
        preview_rows=preview.to_dict(orient="records"),
        total_rows=len(df),
        output_columns=list(df.columns),
    )


@router.post("/split")
async def transform_split(request: TransformSplitRequest) -> StreamingResponse:
    """Apply column config, split into N-row chunks, return ZIP of CSVs."""
    if request.rows_per_chunk < 1:
        raise HTTPException(status_code=400, detail="rows_per_chunk must be >= 1.")

    df = _apply_transform(request.all_rows, request.selected_columns, request.rename_map)

    chunks = [df.iloc[i : i + request.rows_per_chunk] for i in range(0, len(df), request.rows_per_chunk)]
    if not chunks:
        raise HTTPException(status_code=400, detail="No data to split.")

    safe_prefix = "chunk"
    if request.output_filename:
        candidate = re.sub(r"[^\w\-]", "_", request.output_filename.strip())[:60]
        if candidate:
            safe_prefix = candidate

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        pad = len(str(len(chunks)))
        for i, chunk in enumerate(chunks, start=1):
            csv_bytes = chunk.to_csv(index=False).encode("utf-8")
            zf.writestr(f"{safe_prefix}_{str(i).zfill(pad)}.csv", csv_bytes)
    buffer.seek(0)

    zip_filename = f"{safe_prefix}_chunks.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )
