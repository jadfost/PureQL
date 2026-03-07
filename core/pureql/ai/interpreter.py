"""Natural Language Interpreter — converts user commands to structured actions.

This is the brain of PureQL. It takes what the user says in the chat
and produces a structured JSON action that the core engine can execute.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

from pureql.ai.ollama_client import generate as ollama_generate, is_ollama_running
from pureql.ai.cloud_providers import generate_cloud


SYSTEM_PROMPT = """You are PureQL's AI assistant. You help users analyze, clean, and query their data.

CRITICAL: Your entire response must be ONLY a single valid JSON object. No markdown. No backticks. No explanation text outside the JSON. If you write anything that is not valid JSON, the system will fail.

When the user gives a command, respond with ONLY this JSON structure:
{
  "actions": [
    {
      "type": "<action_type>",
      "params": { ... },
      "target": "all"
    }
  ],
  "explanation": "<brief explanation in the same language the user used>",
  "confidence": 0.9
}

KEY RULES:
- QUERY/ANALYSIS requests → use "query" action with a DuckDB SQL query.
- CLEANING requests → use cleaning actions (deduplicate, fill_nulls, etc.).
- Multi-dataset queries → use JOIN in SQL, referencing exact filenames as table names.
- ALWAYS respond in the same language the user used.
- ONLY output the JSON. Nothing else. No preamble. No postamble.

MULTI-DATASET JOIN EXAMPLE:
User: "show top names by frequency for both genders grouped by decade"
Tables: "female_names.csv" (cols: name, frequency, mean_age), "male_names.csv" (cols: name, frequency, mean_age)
→ Output:
{"actions":[{"type":"query","params":{"sql":"SELECT 'F' as gender, name, frequency, FLOOR(mean_age/10)*10 as decade FROM \\"female_names.csv\\" UNION ALL SELECT 'M', name, frequency, FLOOR(mean_age/10)*10 FROM \\"male_names.csv\\" ORDER BY decade, frequency DESC","description":"Names by frequency grouped by decade for both genders"},"target":"all"}],"explanation":"Combining both datasets to show top names per decade.","confidence":0.9}

AVAILABLE ACTIONS:

query:
  params: { "sql": "<DuckDB SQL>", "description": "<human description>" }
  Use for: any analysis, filtering, grouping, joining, aggregating data.
  Table names = exact dataset filenames (e.g. "female_names.csv", "male_names.csv")

deduplicate:
  params: { "strategy": "exact"|"fuzzy", "threshold": 0.85, "subset": ["col1"] }

standardize:
  params: { "method": "lowercase"|"titlecase"|"cluster_merge" }
  target: "column:column_name"

fix_formats:
  params: { "format_type": "dates"|"phones"|"emails"|"auto" }

fill_nulls:
  params: { "strategy": "mean"|"median"|"mode"|"forward"|"ml" }

remove_outliers:
  params: { "method": "iqr"|"zscore", "threshold": 1.5 }
  target: "column:column_name"

filter_rows:
  params: { "condition": "SQL condition" }

drop_columns:
  params: { "columns": ["col1", "col2"] }

rename_column:
  params: { "from": "old_name", "to": "new_name" }

profile:
  params: {}
"""


@dataclass
class Action:
    """A single structured action to execute."""
    type: str
    params: dict[str, Any] = field(default_factory=dict)
    target: str = "all"


@dataclass
class InterpretedCommand:
    """Result of interpreting a user's natural language command."""
    actions: list[Action]
    explanation: str
    confidence: float
    raw_response: str = ""
    error: Optional[str] = None


def build_context(
    columns: list[dict],
    row_count: int,
    quality_score: int,
    issues: list[str],
    sample_values: Optional[dict[str, list[str]]] = None,
) -> str:
    """Build context string about the current dataset for the AI."""
    lines = [
        f"CURRENT DATASET: {row_count:,} rows",
        f"QUALITY SCORE: {quality_score}/100",
        f"COLUMNS ({len(columns)}):",
    ]

    for col in columns:
        col_info = f"  - {col['name']} ({col['type']})"
        if col.get('nullCount', 0) > 0:
            col_info += f" [{col['nullCount']} nulls]"
        if col.get('issues'):
            col_info += f" ⚠ {', '.join(col['issues'])}"
        lines.append(col_info)

    if issues:
        lines.append(f"\nDETECTED ISSUES ({len(issues)}):")
        for issue in issues[:10]:
            lines.append(f"  ⚠ {issue}")

    if sample_values:
        lines.append("\nSAMPLE VALUES:")
        for col_name, values in list(sample_values.items())[:5]:
            lines.append(f"  {col_name}: {values[:3]}")

    return "\n".join(lines)


def interpret(
    user_message: str,
    context: str = "",
    model: str = "qwen2.5:7b",
    provider: str = "ollama",
    api_key: Optional[str] = None,
) -> InterpretedCommand:
    """Interpret a natural language command into structured actions.

    Args:
        user_message: What the user typed in the chat.
        context: Dataset context string (from build_context).
        model: Model name to use.
        provider: "ollama", "openai", "anthropic", "groq", "mistral".
        api_key: Required for cloud providers.

    Returns:
        An InterpretedCommand with actions and explanation.
    """
    # Build the full prompt
    prompt_parts = []
    if context:
        prompt_parts.append(f"DATASET CONTEXT:\n{context}\n")
    prompt_parts.append(f"USER COMMAND: {user_message}")
    full_prompt = "\n".join(prompt_parts)

    # Generate response
    try:
        if provider == "ollama":
            if not is_ollama_running():
                return InterpretedCommand(
                    actions=[],
                    explanation="Ollama is not running. Please start it first.",
                    confidence=0.0,
                    error="ollama_not_running",
                )
            raw = ollama_generate(
                prompt=full_prompt,
                model=model,
                system=SYSTEM_PROMPT,
                temperature=0.1,
            )
        elif provider in ("openai", "anthropic", "groq", "mistral"):
            if not api_key:
                return InterpretedCommand(
                    actions=[],
                    explanation=f"API key required for {provider}.",
                    confidence=0.0,
                    error="missing_api_key",
                )
            raw = generate_cloud(
                prompt=full_prompt,
                system=SYSTEM_PROMPT,
                provider_name=provider,
                api_key=api_key,
                model=model,
                temperature=0.1,
            )
        else:
            return InterpretedCommand(
                actions=[],
                explanation=f"Unknown provider: {provider}",
                confidence=0.0,
                error="unknown_provider",
            )
    except ConnectionError as e:
        return InterpretedCommand(
            actions=[],
            explanation=f"Connection error: {str(e)}",
            confidence=0.0,
            error="connection_error",
            raw_response=str(e),
        )

    # Parse the JSON response
    return _parse_response(raw)


def _parse_response(raw: str) -> InterpretedCommand:
    """Parse the AI's JSON response into an InterpretedCommand."""
    # Clean up common issues
    cleaned = raw.strip()

    # Remove markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first and last lines (``` markers)
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    # Try to find JSON in the response
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}") + 1

    if json_start == -1 or json_end <= json_start:
        return InterpretedCommand(
            actions=[],
            explanation=cleaned,  # Use the raw text as explanation
            confidence=0.3,
            raw_response=raw,
            error="no_json_found",
        )

    json_str = cleaned[json_start:json_end]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        return InterpretedCommand(
            actions=[],
            explanation=f"Failed to parse AI response. Raw: {cleaned[:200]}",
            confidence=0.0,
            raw_response=raw,
            error=f"json_parse_error: {e}",
        )

    # Extract actions
    actions = []
    for action_data in data.get("actions", []):
        if isinstance(action_data, dict) and "type" in action_data:
            actions.append(Action(
                type=action_data["type"],
                params=action_data.get("params", {}),
                target=action_data.get("target", "all"),
            ))

    return InterpretedCommand(
        actions=actions,
        explanation=data.get("explanation", ""),
        confidence=data.get("confidence", 0.5),
        raw_response=raw,
    )


# ── Convenience functions for common operations ──


def quick_interpret(user_message: str, context: str = "") -> InterpretedCommand:
    """Quick interpretation using default Ollama model.

    This is the main function to use from the Tauri bridge.
    """
    return interpret(
        user_message=user_message,
        context=context,
        model="qwen2.5:7b",
        provider="ollama",
    )