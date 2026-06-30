from typing import Any

from .anthropic_provider import chat_anthropic, generate_dashboard_anthropic
from .gemini_provider import chat_gemini, generate_dashboard_gemini
from .groq_provider import chat_groq, generate_dashboard_groq
from .openai_provider import chat_openai, generate_dashboard_openai


async def generate_dashboard(
    provider: str,
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    row_count: int = 0,
) -> dict[str, Any]:
    """Route dashboard generation to the appropriate LLM provider."""
    match provider:
        case "openai":
            return await generate_dashboard_openai(api_key, schema, sample, row_count)
        case "anthropic":
            return await generate_dashboard_anthropic(api_key, schema, sample, row_count)
        case "gemini":
            return await generate_dashboard_gemini(api_key, schema, sample, row_count)
        case "groq":
            return await generate_dashboard_groq(api_key, schema, sample, row_count)
        case _:
            raise ValueError(f"Unknown provider: {provider!r}")


async def chat_with_data(
    provider: str,
    api_key: str,
    schema: list[dict[str, str]],
    sample: list[dict[str, Any]],
    history: list[dict[str, str]],
    message: str,
    stats_text: str | None = None,
) -> str:
    """Route chat to the appropriate LLM provider."""
    match provider:
        case "openai":
            return await chat_openai(api_key, schema, sample, history, message, stats_text)
        case "anthropic":
            return await chat_anthropic(api_key, schema, sample, history, message, stats_text)
        case "gemini":
            return await chat_gemini(api_key, schema, sample, history, message, stats_text)
        case "groq":
            return await chat_groq(api_key, schema, sample, history, message, stats_text)
        case _:
            raise ValueError(f"Unknown provider: {provider!r}")
