from typing import Any

from google import genai
from google.genai import types

from .base import DASHBOARD_SYSTEM_PROMPT, build_chat_system_prompt, build_user_prompt, parse_dashboard_json


async def generate_dashboard_gemini(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate dashboard config via Google Gemini 2.0 Flash."""
    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=build_user_prompt(schema, sample),
        config=types.GenerateContentConfig(
            system_instruction=DASHBOARD_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.3,
        ),
    )
    return parse_dashboard_json(response.text or "{}")


async def chat_gemini(
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    history: list[dict[str, str]],
    message: str,
) -> str:
    """Chat about the dataset via Google Gemini 2.0 Flash."""
    client = genai.Client(api_key=api_key)
    contents: list[types.Content] = []
    for turn in history:
        role = "model" if turn["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=build_chat_system_prompt(schema, sample),
            temperature=0.7,
        ),
    )
    return response.text or ""
