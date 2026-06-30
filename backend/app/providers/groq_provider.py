from typing import Any

from groq import AsyncGroq

from .base import DASHBOARD_SYSTEM_PROMPT, build_chat_system_prompt, build_user_prompt, parse_dashboard_json


async def generate_dashboard_groq(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    row_count: int = 0,
) -> dict[str, Any]:
    """Generate dashboard config via Groq llama-3.3-70b-versatile."""
    client = AsyncGroq(api_key=api_key)
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": DASHBOARD_SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(schema, sample, row_count)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    content = response.choices[0].message.content or "{}"
    return parse_dashboard_json(content)


async def chat_groq(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    history: list[dict[str, str]],
    message: str,
    dataset_stats: dict[str, Any] | None = None,
) -> str:
    """Chat about the dataset via Groq llama-3.3-70b-versatile."""
    client = AsyncGroq(api_key=api_key)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": build_chat_system_prompt(schema, sample, dataset_stats)}
    ]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""
