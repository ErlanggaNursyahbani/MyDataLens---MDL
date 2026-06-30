from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.providers import generate_dashboard

router = APIRouter(prefix="/analyze", tags=["analyze"])


class ColumnInfo(BaseModel):
    name: str
    dtype: str


class AnalyzeRequest(BaseModel):
    columns: list[ColumnInfo]
    sample: list[dict[str, Any]]
    api_key: str
    provider: str
    row_count: int = 0


class ChartConfig(BaseModel):
    type: str
    title: str
    data: list[dict[str, Any]]
    x_key: str | None = None
    y_keys: list[str] | None = None
    name_key: str | None = None
    value_key: str | None = None


class AnalyzeResponse(BaseModel):
    charts: list[ChartConfig]
    insights: list[str]


class SchemaItem(BaseModel):
    name: str
    dtype: str


class Top10Request(BaseModel):
    all_rows: list[dict[str, Any]]
    schema: list[SchemaItem]


class Top10Row(BaseModel):
    label: str
    value: float


class Top10Table(BaseModel):
    title: str
    index_col: str
    value_col: str
    rows: list[Top10Row]


class Top10Response(BaseModel):
    tables: list[Top10Table]


@router.post("/top10", response_model=Top10Response)
async def top10_tables(request: Top10Request) -> Top10Response:
    """Compute up to 3 Top-10 ranked tables using Pandas — no LLM involved."""
    if not request.all_rows:
        return Top10Response(tables=[])

    try:
        df = pd.DataFrame(request.all_rows)
    except Exception:
        return Top10Response(tables=[])

    cat_cols = [s.name for s in request.schema if s.dtype == "string"]
    num_cols = [s.name for s in request.schema if s.dtype in ("integer", "float")]

    # Explicit coercion — pandas 3.x may infer object dtype for columns containing None
    for col in num_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    tables: list[Top10Table] = []
    for cat_col in cat_cols:
        if cat_col not in df.columns:
            continue
        for num_col in num_cols:
            if len(tables) >= 3:
                break
            if num_col not in df.columns:
                continue
            try:
                sub = df[[cat_col, num_col]].dropna(subset=[num_col])
                if sub.empty:
                    continue
                grouped = (
                    sub.groupby(cat_col, observed=True)[num_col]
                    .sum()
                    .reset_index()
                    .sort_values(num_col, ascending=False)
                    .head(10)
                )
                if len(grouped) < 2:
                    continue
                rows = [
                    Top10Row(label=str(r[cat_col]), value=float(r[num_col]))
                    for _, r in grouped.iterrows()
                ]
                tables.append(Top10Table(
                    title=f"Top 10 {cat_col} by {num_col}",
                    index_col=cat_col,
                    value_col=num_col,
                    rows=rows,
                ))
            except Exception:
                continue
        if len(tables) >= 3:
            break

    return Top10Response(tables=tables)


@router.post("", response_model=AnalyzeResponse)
async def analyze_dataset(request: AnalyzeRequest) -> AnalyzeResponse:
    """Call the chosen LLM provider and return chart configs + insights."""
    schema = [{"name": col.name, "dtype": col.dtype} for col in request.columns]

    try:
        result = await generate_dashboard(
            provider=request.provider,
            api_key=request.api_key,
            schema=schema,
            sample=request.sample,
            row_count=request.row_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

    charts = [ChartConfig(**chart) for chart in result.get("charts", [])]
    insights: list[str] = result.get("insights", [])
    return AnalyzeResponse(charts=charts, insights=insights)
