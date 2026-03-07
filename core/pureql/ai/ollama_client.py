"""Ollama client — manages local LLM installation, models, and inference."""

from __future__ import annotations

import json
import subprocess
import platform
import shutil
from dataclasses import dataclass
from typing import AsyncIterator, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError


OLLAMA_BASE_URL = "http://127.0.0.1:11434"

# Models recommended by hardware tier
MODEL_TIERS = {
    "basic": [
        {
            "name": "phi3:mini",
            "display_name": "Phi-3 Mini (3.8B)",
            "size_gb": 2.3,
            "quality": "Good",
            "speed": "Fast",
            "best_for": "Simple tasks, basic cleaning, short commands",
            "min_ram_gb": 4,
        },
        {
            "name": "tinyllama",
            "display_name": "TinyLlama (1.1B)",
            "size_gb": 0.6,
            "quality": "Acceptable",
            "speed": "Very fast",
            "best_for": "Very limited PCs, quick responses",
            "min_ram_gb": 4,
        },
        {
            "name": "qwen2.5:3b",
            "display_name": "Qwen 2.5 3B",
            "size_gb": 1.9,
            "quality": "Good",
            "speed": "Fast",
            "best_for": "Good balance for basic hardware",
            "min_ram_gb": 4,
        },
    ],
    "intermediate": [
        {
            "name": "qwen2.5:7b",
            "display_name": "Qwen 2.5 7B ⭐",
            "size_gb": 4.4,
            "quality": "Excellent for data",
            "speed": "Medium",
            "best_for": "Best for data & SQL. Recommended for PureQL.",
            "min_ram_gb": 8,
            "recommended": True,
        },
        {
            "name": "mistral:7b",
            "display_name": "Mistral 7B",
            "size_gb": 4.1,
            "quality": "Very good",
            "speed": "Medium",
            "best_for": "Versatile and fast. Great all-rounder.",
            "min_ram_gb": 8,
        },
        {
            "name": "llama3.2:8b",
            "display_name": "Llama 3.2 8B",
            "size_gb": 4.7,
            "quality": "Very good",
            "speed": "Medium",
            "best_for": "Good context understanding",
            "min_ram_gb": 8,
        },
        {
            "name": "gemma2:9b",
            "display_name": "Gemma 2 9B",
            "size_gb": 5.4,
            "quality": "Excellent",
            "speed": "Medium-slow",
            "best_for": "Best quality for complex instructions",
            "min_ram_gb": 12,
        },
    ],
    "advanced": [
        {
            "name": "qwen2.5:14b",
            "display_name": "Qwen 2.5 14B",
            "size_gb": 8.9,
            "quality": "Superior",
            "speed": "Slow",
            "best_for": "Deep analysis, complex SQL, reasoning",
            "min_ram_gb": 16,
        },
        {
            "name": "deepseek-r1:8b",
            "display_name": "DeepSeek-R1 8B",
            "size_gb": 4.9,
            "quality": "Excellent reasoning",
            "speed": "Medium",
            "best_for": "Chain of thought, advanced SQL optimization",
            "min_ram_gb": 12,
        },
        {
            "name": "mistral-small:22b",
            "display_name": "Mistral Small 22B",
            "size_gb": 13.0,
            "quality": "Near cloud",
            "speed": "Slow",
            "best_for": "Performance close to paid models",
            "min_ram_gb": 24,
        },
    ],
}


@dataclass
class HardwareInfo:
    """System hardware information."""
    ram_gb: float
    cpu_cores: int
    gpu: Optional[str]
    os: str
    arch: str

    @property
    def tier(self) -> str:
        if self.ram_gb >= 24:
            return "advanced"
        elif self.ram_gb >= 12:
            return "intermediate"
        else:
            return "basic"


def detect_hardware() -> HardwareInfo:
    """Detect system hardware specifications."""
    import os

    ram_gb = 8.0  # default fallback
    try:
        if platform.system() == "Darwin":
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                ram_gb = int(result.stdout.strip()) / (1024 ** 3)
        elif platform.system() == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        kb = int(line.split()[1])
                        ram_gb = kb / (1024 ** 2)
                        break
        elif platform.system() == "Windows":
            result = subprocess.run(
                ["wmic", "computersystem", "get", "TotalPhysicalMemory"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                if len(lines) >= 2:
                    ram_gb = int(lines[1].strip()) / (1024 ** 3)
    except Exception:
        pass

    # GPU detection (basic)
    gpu = None
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            gpu = result.stdout.strip().split("\n")[0]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    if gpu is None and platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True, text=True, timeout=10,
            )
            if "Apple" in result.stdout:
                gpu = "Apple Silicon (integrated)"
        except Exception:
            pass

    return HardwareInfo(
        ram_gb=round(ram_gb, 1),
        cpu_cores=os.cpu_count() or 4,
        gpu=gpu,
        os=platform.system(),
        arch=platform.machine(),
    )


def get_recommended_models(hardware: HardwareInfo) -> list[dict]:
    """Get list of recommended models for the detected hardware.

    Returns models from the appropriate tier, filtered by RAM.
    """
    tier = hardware.tier
    models = MODEL_TIERS.get(tier, MODEL_TIERS["basic"])

    # Also include lower tier models as options
    all_models = []
    for t in ["basic", "intermediate", "advanced"]:
        for m in MODEL_TIERS[t]:
            if m["min_ram_gb"] <= hardware.ram_gb:
                m_copy = dict(m)
                m_copy["tier"] = t
                all_models.append(m_copy)
        if t == tier:
            break

    return all_models


def is_ollama_installed() -> bool:
    """Check if Ollama is installed on the system."""
    return shutil.which("ollama") is not None


def is_ollama_running() -> bool:
    """Check if the Ollama server is running."""
    try:
        req = Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET")
        with urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except (URLError, OSError, TimeoutError):
        return False


def get_installed_models() -> list[dict]:
    """Get list of models currently installed in Ollama."""
    try:
        req = Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET")
        with urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("models", [])
    except (URLError, OSError, TimeoutError):
        return []


def start_ollama() -> bool:
    """Start the Ollama server as a background process."""
    try:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait a bit for it to start
        import time
        for _ in range(10):
            time.sleep(1)
            if is_ollama_running():
                return True
        return False
    except (FileNotFoundError, OSError):
        return False


def pull_model(model_name: str, on_progress=None) -> bool:
    """Download a model from Ollama registry.

    Args:
        model_name: The model name (e.g., "qwen2.5:7b")
        on_progress: Optional callback(status: str, percent: float)

    Returns:
        True if the model was pulled successfully.
    """
    try:
        payload = json.dumps({"name": model_name, "stream": True}).encode()
        req = Request(
            f"{OLLAMA_BASE_URL}/api/pull",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urlopen(req, timeout=600) as resp:
            for line in resp:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line.decode())
                    status = data.get("status", "")
                    total = data.get("total", 0)
                    completed = data.get("completed", 0)
                    pct = (completed / total * 100) if total > 0 else 0

                    if on_progress:
                        on_progress(status, pct)
                except json.JSONDecodeError:
                    continue

        return True
    except (URLError, OSError, TimeoutError) as e:
        print(f"Error pulling model: {e}")
        return False


def generate(
    prompt: str,
    model: str = "qwen2.5:7b",
    system: str = "",
    temperature: float = 0.1,
    max_tokens: int = 2048,
) -> str:
    """Generate a completion from the local Ollama model.

    Args:
        prompt: The user prompt.
        model: The Ollama model name.
        system: Optional system prompt.
        temperature: Sampling temperature (lower = more deterministic).
        max_tokens: Maximum tokens to generate.

    Returns:
        The model's response text.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    req = Request(
        f"{OLLAMA_BASE_URL}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode())
            return data.get("response", "")
    except (URLError, OSError, TimeoutError) as e:
        raise ConnectionError(f"Failed to connect to Ollama: {e}")


def generate_stream(
    prompt: str,
    model: str = "qwen2.5:7b",
    system: str = "",
    temperature: float = 0.1,
    max_tokens: int = 2048,
):
    """Generate a streaming completion from Ollama.

    Yields chunks of text as they are generated.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    req = Request(
        f"{OLLAMA_BASE_URL}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=300) as resp:
            for line in resp:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line.decode())
                    chunk = data.get("response", "")
                    if chunk:
                        yield chunk
                    if data.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
    except (URLError, OSError, TimeoutError) as e:
        raise ConnectionError(f"Failed to connect to Ollama: {e}")
