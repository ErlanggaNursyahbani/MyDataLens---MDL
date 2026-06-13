from typing import Any

import anthropic

from .base import DASHBOARD_SYSTEM_PROMPT, build_user_prompt, parse_dashboard_json


async def generate_dashboard_anthropic(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate dashboard config via Anthropic claude-haiku-4-5."""
    client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=DASHBOARD_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": build_user_prompt(schema, sample)},
        ],
        temperature=0.3,
    )
    content = message.content[0].text if message.content else "{}"
    return parse_dashboard_json(content)
