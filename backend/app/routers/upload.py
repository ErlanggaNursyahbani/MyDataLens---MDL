import io
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

router = APIRouter(prefix="/upload", tags=["upload"])


class ColumnInfo(BaseModel):
    name: str
    dtype: str


class UploadResponse(BaseModel):
    columns: list[ColumnInfo]
    sample: list[dict[str, Any]]
    all_rows: list[dict[str, Any]]
    row_count: int


def _map_dtype(dtype: Any) -> str:
    """Map pandas dtype to a human-readable type name."""
    name = str(dtype)
    if name == "object" or name.startswith("string"):
        return "string"
    if "int" in name:
        return "integer"
    if "float" in name:
        return "float"
    if "datetime" in name or "timestamp" in name.lower():
        return "datetime"
    if name == "bool":
        return "boolean"
    return name


def _serialize_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert DataFrame rows to a JSON-safe list of dicts."""
    rows = df.copy()
    for col in rows.columns:
        if pd.api.types.is_datetime64_any_dtype(rows[col]):
            rows[col] = rows[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
    rows = rows.where(pd.notnull(rows), other=None)
    return rows.to_dict(orient="records")


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    """Parse an uploaded CSV or Excel file and return schema + sample + all rows."""
    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: .csv, .xlsx, .xls",
        )

    content = await file.read()

    try:
        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Failed to parse file: {exc}"
        ) from exc

    columns = [
        ColumnInfo(name=str(col), dtype=_map_dtype(df[col].dtype))
        for col in df.columns
    ]

    return UploadResponse(
        columns=columns,
        sample=_serialize_rows(df.head(20)),
        all_rows=_serialize_rows(df),
        row_count=len(df),
    )
