from typing import Any

from google import genai
from google.genai import types

from .base import DASHBOARD_SYSTEM_PROMPT, build_user_prompt, parse_dashboard_json


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
