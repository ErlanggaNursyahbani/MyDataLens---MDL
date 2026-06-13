import io
import re
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/merge", tags=["merge"])


def _build_merged(
    left_rows: list[dict[str, Any]],
    right_rows: list[dict[str, Any]],
    left_key: str,
    right_key: str,
    how: str,
) -> pd.DataFrame:
    """Build the merged DataFrame; raises HTTPException on bad input."""
    if not left_rows:
        raise HTTPException(status_code=400, detail="Dataset 1 is empty.")
    if not right_rows:
        raise HTTPException(status_code=400, detail="Dataset 2 is empty.")

    try:
        left_df  = pd.DataFrame(left_rows)
        right_df = pd.DataFrame(right_rows)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to build DataFrames: {exc}") from exc

    if left_key not in left_df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{left_key}' not found in Dataset 1.")
    if right_key not in right_df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{right_key}' not found in Dataset 2.")

    try:
        return pd.merge(
            left_df,
            right_df,
            left_on=left_key,
            right_on=right_key,
            how=how,
            suffixes=("_left", "_right"),
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Merge failed: {exc}") from exc


class MergePreviewRequest(BaseModel):
    left_rows: list[dict[str, Any]]
    left_key: str
    right_rows: list[dict[str, Any]]
    right_key: str
    how: Literal["inner", "left", "right", "outer"] = "inner"


class MergePreviewResponse(BaseModel):
    preview_rows: list[dict[str, Any]]
    left_count: int
    right_count: int
    left_columns: int
    right_columns: int
    merged_count: int
    merged_columns: list[str]


class MergeRequest(BaseModel):
    left_rows: list[dict[str, Any]]
    left_key: str
    right_rows: list[dict[str, Any]]
    right_key: str
    how: Literal["inner", "left", "right", "outer"] = "inner"
    output_filename: str | None = None


@router.post("/preview", response_model=MergePreviewResponse)
async def merge_preview(request: MergePreviewRequest) -> MergePreviewResponse:
    """Return merge stats + first 5 rows — no file download."""
    merged = _build_merged(
        request.left_rows, request.right_rows,
        request.left_key, request.right_key, request.how,
    )
    preview = merged.head(5).where(pd.notnull(merged.head(5)), other=None)
    return MergePreviewResponse(
        preview_rows=preview.to_dict(orient="records"),
        left_count=len(request.left_rows),
        right_count=len(request.right_rows),
        left_columns=len(request.left_rows[0]) if request.left_rows else 0,
        right_columns=len(request.right_rows[0]) if request.right_rows else 0,
        merged_count=len(merged),
        merged_columns=list(merged.columns),
    )


@router.post("")
async def merge_datasets(request: MergeRequest) -> StreamingResponse:
    """Merge two datasets with Pandas — no LLM involved."""
    merged = _build_merged(
        request.left_rows, request.right_rows,
        request.left_key, request.right_key, request.how,
    )
    csv_content = merged.to_csv(index=False)

    safe_name = "merged"
    if request.output_filename:
        candidate = re.sub(r"[^\w\-]", "_", request.output_filename.strip())[:80]
        if candidate:
            safe_name = candidate

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
    )
