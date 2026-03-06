"""Cloud AI providers — OpenAI, Anthropic, Groq support via user's API keys."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError


@dataclass
class CloudProvider:
    """Configuration for a cloud AI provider."""
    name: str
    api_key: str
    base_url: str
    model: str
    max_tokens: int = 2048
    temperature: float = 0.1


PROVIDERS = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1/chat/completions",
        "default_model": "gpt-4o-mini",
        "models": ["gpt-4o", "gpt-4o-mini"],
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": "https://api.anthropic.com/v1/messages",
        "default_model": "claude-sonnet-4-20250514",
        "models": ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "default_model": "llama-3.3-70b-versatile",
        "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    },
    "mistral": {
        "name": "Mistral AI",
        "base_url": "https://api.mistral.ai/v1/chat/completions",
        "default_model": "mistral-small-latest",
        "models": ["mistral-large-latest", "mistral-small-latest"],
    },
}


def generate_openai_compatible(
    prompt: str,
    system: str,
    api_key: str,
    base_url: str,
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 2048,
) -> str:
    """Generate using OpenAI-compatible API (works for OpenAI, Groq, Mistral)."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    req = Request(
        base_url,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
            return data["choices"][0]["message"]["content"]
    except (URLError, OSError, KeyError) as e:
        raise ConnectionError(f"Cloud API error: {e}")


def generate_anthropic(
    prompt: str,
    system: str,
    api_key: str,
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 2048,
) -> str:
    """Generate using Anthropic's API."""
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }

    req = Request(
        PROVIDERS["anthropic"]["base_url"],
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
            return data["content"][0]["text"]
    except (URLError, OSError, KeyError) as e:
        raise ConnectionError(f"Anthropic API error: {e}")


def generate_cloud(
    prompt: str,
    system: str,
    provider_name: str,
    api_key: str,
    model: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 2048,
) -> str:
    """Unified cloud generation — routes to the correct provider.

    Args:
        prompt: User prompt.
        system: System prompt.
        provider_name: One of "openai", "anthropic", "groq", "mistral".
        api_key: The user's API key for the provider.
        model: Optional model override. Uses default if None.
        temperature: Sampling temperature.
        max_tokens: Max tokens to generate.

    Returns:
        The model's response text.
    """
    if provider_name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider_name}. Available: {list(PROVIDERS.keys())}")

    provider = PROVIDERS[provider_name]
    model = model or provider["default_model"]

    if provider_name == "anthropic":
        return generate_anthropic(
            prompt=prompt,
            system=system,
            api_key=api_key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    else:
        return generate_openai_compatible(
            prompt=prompt,
            system=system,
            api_key=api_key,
            base_url=provider["base_url"],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )


def validate_api_key(provider_name: str, api_key: str) -> bool:
    """Test if an API key is valid by making a minimal request."""
    try:
        generate_cloud(
            prompt="Say 'ok'",
            system="Respond with only 'ok'.",
            provider_name=provider_name,
            api_key=api_key,
            max_tokens=5,
        )
        return True
    except Exception:
        return False
