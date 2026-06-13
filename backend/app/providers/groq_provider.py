from typing import Any

from groq import AsyncGroq

from .base import DASHBOARD_SYSTEM_PROMPT, build_user_prompt, parse_dashboard_json


async def generate_dashboard_groq(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate dashboard config via Groq llama-3.3-70b-versatile."""
    client = AsyncGroq(api_key=api_key)
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": DASHBOARD_SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(schema, sample)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    content = response.choices[0].message.content or "{}"
    return parse_dashboard_json(content)
