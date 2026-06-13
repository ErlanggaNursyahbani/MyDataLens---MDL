from typing import Any

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
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

    charts = [ChartConfig(**chart) for chart in result.get("charts", [])]
    insights: list[str] = result.get("insights", [])
    return AnalyzeResponse(charts=charts, insights=insights)
