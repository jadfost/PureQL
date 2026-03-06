"""PureQL AI module — Local and cloud LLM integration.

This module handles:
- Ollama installation detection and model management
- Hardware detection and model recommendations
- Natural language interpretation (chat -> structured actions)
- Cloud provider support (OpenAI, Anthropic, Groq, Mistral)
"""

from pureql.ai.ollama_client import (
    detect_hardware,
    get_recommended_models,
    is_ollama_installed,
    is_ollama_running,
    get_installed_models,
    start_ollama,
    pull_model,
    generate,
    generate_stream,
    HardwareInfo,
)

from pureql.ai.interpreter import (
    interpret,
    quick_interpret,
    build_context,
    InterpretedCommand,
    Action,
)

from pureql.ai.cloud_providers import (
    generate_cloud,
    validate_api_key,
    PROVIDERS,
)

__all__ = [
    "detect_hardware", "get_recommended_models", "is_ollama_installed",
    "is_ollama_running", "get_installed_models", "start_ollama", "pull_model",
    "generate", "generate_stream", "HardwareInfo",
    "interpret", "quick_interpret", "build_context", "InterpretedCommand", "Action",
    "generate_cloud", "validate_api_key", "PROVIDERS",
]
