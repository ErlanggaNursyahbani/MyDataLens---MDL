import json
import re
from typing import Any

CHAT_SYSTEM_PROMPT = (
    "You are a data analyst assistant. ONLY answer questions about the uploaded dataset based on "
    "the schema and sample provided. If the user asks anything unrelated to the data, politely "
    "explain that you can only help with questions about their dataset. "
    "If a question is ambiguous or unclear, ask for clarification before answering. "
    "Be concise, specific, and reference column names when relevant. "
    "Format numbers with thousand separators for readability (e.g. 1,234,567)."
)

DASHBOARD_SYSTEM_PROMPT = """You are a data analysis expert. Analyze the given dataset schema and sample rows, then generate a dashboard configuration.

Return ONLY a valid JSON object. No markdown, no code blocks, no explanation — raw JSON only.

Required structure:
{
  "charts": [
    {
      "type": "bar",
      "title": "string",
      "x_key": "column_name",
      "y_keys": ["column_name"],
      "data": [{"x_key_name": "value", "y_key_name": 123}]
    },
    {
      "type": "line",
      "title": "string",
      "x_key": "column_name",
      "y_keys": ["column_name"],
      "data": [...]
    },
    {
      "type": "pie",
      "title": "string",
      "name_key": "column_name",
      "value_key": "column_name",
      "data": [{"name_key_name": "category", "value_key_name": 123}]
    }
  ],
  "insights": ["string", "string", "string"]
}

Rules:
- Generate 2–4 charts that best visualise the data
- Use "bar" for categorical comparisons (x is categorical, y_keys are numeric)
- Use "line" for time series (x is datetime or sequential, y_keys are numeric)
- Use "pie" for distributions (name_key is categorical, value_key is numeric; max 8 slices, merge small ones into "Other")
- Each chart's data array must include only the keys referenced by its x_key/y_keys or name_key/value_key
- Aggregate sample rows as needed; max 20 data points per chart
- Provide 3–5 concise, specific insights about patterns, ranges, or distributions visible in the data
- Only use column names that exist in the provided schema"""


def build_user_prompt(schema: list[dict[str, str]], sample: list[dict[str, Any]]) -> str:
    """Build the user-turn message with schema and sample JSON."""
    rows = sample[:20]
    return (
        f"Dataset schema:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
        f"Sample data ({len(rows)} rows):\n{json.dumps(rows, ensure_ascii=False, default=str)}"
    )


def build_chat_system_prompt(schema: list[dict[str, str]], sample: list[dict[str, Any]]) -> str:
    """Build the chat system prompt that includes dataset context."""
    rows = sample[:20]
    context = (
        f"\n\nDataset schema:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
        f"Sample data ({len(rows)} rows):\n{json.dumps(rows, ensure_ascii=False, default=str)}"
    )
    return CHAT_SYSTEM_PROMPT + context


def parse_dashboard_json(text: str) -> dict[str, Any]:
    """Parse dashboard JSON from LLM response, stripping any markdown fences."""
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ``` blocks
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)
    text = text.strip()

    data: dict[str, Any] = json.loads(text)
    if "charts" not in data or "insights" not in data:
        raise ValueError("AI response is missing 'charts' or 'insights' keys")
    return data
