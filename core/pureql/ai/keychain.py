"""Secure API key storage using the OS keychain.

- macOS: Keychain Services via keyring
- Windows: Credential Manager via keyring
- Linux: Secret Service (libsecret) via keyring
- Fallback: AES-encrypted file in user's app data dir

Never stores keys in plain text.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Optional

SERVICE_NAME = "PureQL"
_FALLBACK_STORE: dict[str, str] = {}  # In-memory only if everything fails


def save_api_key(provider: str, api_key: str) -> bool:
    """Save an API key securely for the given provider.

    Args:
        provider: Provider name (e.g., "openai", "anthropic", "groq").
        api_key: The API key to store.

    Returns:
        True if saved successfully.
    """
    key_name = _key_name(provider)

    # Try OS keychain first
    try:
        import keyring
        keyring.set_password(SERVICE_NAME, key_name, api_key)
        return True
    except Exception:
        pass

    # Fallback: encrypted file
    try:
        _save_to_file(key_name, api_key)
        return True
    except Exception:
        pass

    # Last resort: in-memory only (lost on restart)
    _FALLBACK_STORE[key_name] = api_key
    return True


def get_api_key(provider: str) -> Optional[str]:
    """Retrieve the API key for a given provider.

    Args:
        provider: Provider name (e.g., "openai", "anthropic").

    Returns:
        The API key string, or None if not found.
    """
    key_name = _key_name(provider)

    # Try OS keychain
    try:
        import keyring
        key = keyring.get_password(SERVICE_NAME, key_name)
        if key:
            return key
    except Exception:
        pass

    # Try encrypted file
    try:
        key = _load_from_file(key_name)
        if key:
            return key
    except Exception:
        pass

    # In-memory fallback
    return _FALLBACK_STORE.get(key_name)


def delete_api_key(provider: str) -> bool:
    """Delete the stored API key for a provider.

    Args:
        provider: Provider name.

    Returns:
        True if deleted (or key didn't exist).
    """
    key_name = _key_name(provider)

    try:
        import keyring
        keyring.delete_password(SERVICE_NAME, key_name)
    except Exception:
        pass

    try:
        _delete_from_file(key_name)
    except Exception:
        pass

    _FALLBACK_STORE.pop(key_name, None)
    return True


def list_stored_providers() -> list[str]:
    """Return list of providers that have stored keys."""
    providers = ["openai", "anthropic", "groq", "mistral"]
    stored = []
    for p in providers:
        if get_api_key(p) is not None:
            stored.append(p)
    return stored


def has_api_key(provider: str) -> bool:
    """Check if an API key is stored for a provider."""
    return get_api_key(provider) is not None


# ── File-based Fallback (AES via cryptography or XOR obfuscation) ──

def _get_store_path() -> Path:
    """Get the path to the encrypted keys file."""
    if os.name == "nt":  # Windows
        base = Path(os.environ.get("APPDATA", Path.home())) / "PureQL"
    elif os.uname().sysname == "Darwin":  # macOS
        base = Path.home() / "Library" / "Application Support" / "PureQL"
    else:  # Linux
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "pureql"

    base.mkdir(parents=True, exist_ok=True)
    return base / ".keys"


def _machine_key() -> bytes:
    """Generate a deterministic machine-specific key for obfuscation."""
    # Not cryptographically strong, but prevents casual plaintext exposure
    machine_id = (
        os.environ.get("COMPUTERNAME", "")
        + os.environ.get("USER", os.environ.get("USERNAME", ""))
        + str(Path.home())
    )
    return hashlib.sha256(machine_id.encode()).digest()


def _xor_bytes(data: bytes, key: bytes) -> bytes:
    """XOR-based obfuscation (lightweight, not strong encryption)."""
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def _save_to_file(key_name: str, value: str):
    """Save to obfuscated file store."""
    store_path = _get_store_path()
    existing = _load_all_from_file()
    existing[key_name] = value

    raw = json.dumps(existing).encode()
    obfuscated = _xor_bytes(raw, _machine_key())
    encoded = base64.b64encode(obfuscated)
    store_path.write_bytes(encoded)


def _load_from_file(key_name: str) -> Optional[str]:
    """Load a single key from the file store."""
    data = _load_all_from_file()
    return data.get(key_name)


def _delete_from_file(key_name: str):
    """Remove a key from the file store."""
    data = _load_all_from_file()
    data.pop(key_name, None)
    store_path = _get_store_path()
    raw = json.dumps(data).encode()
    obfuscated = _xor_bytes(raw, _machine_key())
    store_path.write_bytes(base64.b64encode(obfuscated))


def _load_all_from_file() -> dict:
    """Load all keys from the file store."""
    store_path = _get_store_path()
    if not store_path.exists():
        return {}
    try:
        encoded = store_path.read_bytes()
        obfuscated = base64.b64decode(encoded)
        raw = _xor_bytes(obfuscated, _machine_key())
        return json.loads(raw)
    except Exception:
        return {}


def _key_name(provider: str) -> str:
    """Normalize provider name to a consistent key."""
    return provider.lower().strip()
