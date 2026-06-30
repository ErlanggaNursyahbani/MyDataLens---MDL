from typing import Any

import anthropic

from .base import DASHBOARD_SYSTEM_PROMPT, build_chat_system_prompt, build_user_prompt, parse_dashboard_json


async def generate_dashboard_anthropic(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    row_count: int = 0,
) -> dict[str, Any]:
    """Generate dashboard config via Anthropic claude-haiku-4-5."""
    client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=DASHBOARD_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": build_user_prompt(schema, sample, row_count)},
        ],
        temperature=0.3,
    )
    content = message.content[0].text if message.content else "{}"
    return parse_dashboard_json(content)


async def chat_anthropic(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    history: list[dict[str, str]],
    message: str,
    stats_text: str | None = None,
) -> str:
    """Chat about the dataset via Anthropic claude-haiku-4-5."""
    client = anthropic.AsyncAnthropic(api_key=api_key)
    messages: list[dict[str, str]] = []
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=build_chat_system_prompt(schema, sample, stats_text),
        messages=messages,
        temperature=0.7,
    )
    return response.content[0].text if response.content else ""
