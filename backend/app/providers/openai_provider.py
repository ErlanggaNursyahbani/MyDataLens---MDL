from typing import Any

from openai import AsyncOpenAI

from .base import DASHBOARD_SYSTEM_PROMPT, build_user_prompt, parse_dashboard_json


async def generate_dashboard_openai(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate dashboard config via OpenAI gpt-4o-mini."""
    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": DASHBOARD_SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(schema, sample)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    content = response.choices[0].message.content or "{}"
    return parse_dashboard_json(content)
