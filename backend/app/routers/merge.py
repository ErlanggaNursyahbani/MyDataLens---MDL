import io
import re
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/merge", tags=["merge"])


class MergeRequest(BaseModel):
    left_rows: list[dict[str, Any]]
    left_key: str
    right_rows: list[dict[str, Any]]
    right_key: str
    how: Literal["inner", "left", "right", "outer"] = "inner"
    output_filename: str | None = None


@router.post("")
async def merge_datasets(request: MergeRequest) -> StreamingResponse:
    """Merge two datasets with Pandas — no LLM involved."""
    if not request.left_rows:
        raise HTTPException(status_code=400, detail="Dataset 1 is empty.")
    if not request.right_rows:
        raise HTTPException(status_code=400, detail="Dataset 2 is empty.")

    try:
        left_df = pd.DataFrame(request.left_rows)
        right_df = pd.DataFrame(request.right_rows)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to build DataFrames: {exc}") from exc

    if request.left_key not in left_df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{request.left_key}' not found in Dataset 1.")
    if request.right_key not in right_df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{request.right_key}' not found in Dataset 2.")

    try:
        merged = pd.merge(
            left_df,
            right_df,
            left_on=request.left_key,
            right_on=request.right_key,
            how=request.how,
            suffixes=("_left", "_right"),
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Merge failed: {exc}") from exc

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
