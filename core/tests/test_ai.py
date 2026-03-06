"""Tests for PureQL AI module — interpreter, ollama client, cloud providers."""

import json
import pytest

from pureql.ai.interpreter import (
    _parse_response,
    build_context,
    Action,
    InterpretedCommand,
)
from pureql.ai.ollama_client import (
    detect_hardware,
    get_recommended_models,
    HardwareInfo,
    MODEL_TIERS,
)
from pureql.ai.cloud_providers import PROVIDERS


class TestInterpreterParsing:
    """Test the JSON response parser."""

    def test_parse_valid_json(self):
        raw = json.dumps({
            "actions": [
                {"type": "deduplicate", "params": {"strategy": "fuzzy"}, "target": "all"}
            ],
            "explanation": "Removing duplicate rows using fuzzy matching.",
            "confidence": 0.9,
        })
        result = _parse_response(raw)

        assert len(result.actions) == 1
        assert result.actions[0].type == "deduplicate"
        assert result.actions[0].params["strategy"] == "fuzzy"
        assert result.confidence == 0.9
        assert result.error is None

    def test_parse_multiple_actions(self):
        raw = json.dumps({
            "actions": [
                {"type": "deduplicate", "params": {}, "target": "all"},
                {"type": "standardize", "params": {"method": "titlecase"}, "target": "column:city"},
            ],
            "explanation": "Cleaning duplicates then normalizing city names.",
            "confidence": 0.85,
        })
        result = _parse_response(raw)

        assert len(result.actions) == 2
        assert result.actions[0].type == "deduplicate"
        assert result.actions[1].type == "standardize"
        assert result.actions[1].target == "column:city"

    def test_parse_question_no_actions(self):
        raw = json.dumps({
            "actions": [],
            "explanation": "Your dataset has 15,000 rows and a quality score of 72/100.",
            "confidence": 0.95,
        })
        result = _parse_response(raw)

        assert len(result.actions) == 0
        assert "15,000" in result.explanation

    def test_parse_json_with_markdown_fences(self):
        raw = "```json\n" + json.dumps({
            "actions": [{"type": "profile"}],
            "explanation": "Running profiling.",
            "confidence": 0.9,
        }) + "\n```"
        result = _parse_response(raw)

        assert len(result.actions) == 1
        assert result.actions[0].type == "profile"

    def test_parse_json_with_extra_text(self):
        raw = "Sure! Here's what I'll do:\n" + json.dumps({
            "actions": [{"type": "fill_nulls", "params": {"strategy": "ml"}}],
            "explanation": "Filling nulls with ML imputation.",
            "confidence": 0.8,
        }) + "\nLet me know if you need more."
        result = _parse_response(raw)

        assert len(result.actions) == 1
        assert result.actions[0].type == "fill_nulls"

    def test_parse_invalid_json(self):
        raw = "I don't understand what you mean."
        result = _parse_response(raw)

        assert len(result.actions) == 0
        assert result.error == "no_json_found"

    def test_parse_broken_json(self):
        raw = '{"actions": [{"type": "deduplicate"'  # truncated
        result = _parse_response(raw)

        assert len(result.actions) == 0
        assert result.error is not None
        assert "json_parse_error" in result.error

    def test_parse_empty_actions(self):
        raw = json.dumps({
            "actions": [],
            "explanation": "No changes needed.",
            "confidence": 1.0,
        })
        result = _parse_response(raw)

        assert len(result.actions) == 0
        assert result.confidence == 1.0

    def test_parse_missing_fields(self):
        raw = json.dumps({"actions": [{"type": "profile"}]})
        result = _parse_response(raw)

        assert len(result.actions) == 1
        assert result.explanation == ""
        assert result.confidence == 0.5  # default

    def test_action_default_values(self):
        raw = json.dumps({
            "actions": [{"type": "deduplicate"}],
            "explanation": "Dedup.",
            "confidence": 0.9,
        })
        result = _parse_response(raw)

        action = result.actions[0]
        assert action.params == {}
        assert action.target == "all"


class TestBuildContext:
    """Test context building for the AI."""

    def test_basic_context(self):
        ctx = build_context(
            columns=[
                {"name": "id", "type": "Int64", "nullCount": 0},
                {"name": "name", "type": "Utf8", "nullCount": 5},
            ],
            row_count=1000,
            quality_score=75,
            issues=["5 null values in 'name'"],
        )

        assert "1,000 rows" in ctx
        assert "75/100" in ctx
        assert "id" in ctx
        assert "name" in ctx
        assert "5 nulls" in ctx

    def test_context_with_issues(self):
        ctx = build_context(
            columns=[{"name": "city", "type": "Utf8", "nullCount": 0, "issues": ["Inconsistent casing"]}],
            row_count=500,
            quality_score=60,
            issues=["Column 'city': inconsistent casing"],
        )

        assert "Inconsistent casing" in ctx
        assert "DETECTED ISSUES" in ctx

    def test_context_with_samples(self):
        ctx = build_context(
            columns=[{"name": "city", "type": "Utf8", "nullCount": 0}],
            row_count=100,
            quality_score=80,
            issues=[],
            sample_values={"city": ["Bogota", "Medellin", "Cali"]},
        )

        assert "SAMPLE VALUES" in ctx
        assert "Bogota" in ctx


class TestHardwareDetection:
    """Test hardware detection and model recommendations."""

    def test_detect_hardware_returns_info(self):
        hw = detect_hardware()
        assert isinstance(hw, HardwareInfo)
        assert hw.ram_gb > 0
        assert hw.cpu_cores > 0
        assert hw.os in ("Linux", "Darwin", "Windows")

    def test_hardware_tier_basic(self):
        hw = HardwareInfo(ram_gb=6, cpu_cores=4, gpu=None, os="Linux", arch="x86_64")
        assert hw.tier == "basic"

    def test_hardware_tier_intermediate(self):
        hw = HardwareInfo(ram_gb=16, cpu_cores=8, gpu="RTX 3060", os="Linux", arch="x86_64")
        assert hw.tier == "intermediate"

    def test_hardware_tier_advanced(self):
        hw = HardwareInfo(ram_gb=32, cpu_cores=16, gpu="RTX 4090", os="Linux", arch="x86_64")
        assert hw.tier == "advanced"

    def test_recommended_models_basic(self):
        hw = HardwareInfo(ram_gb=6, cpu_cores=4, gpu=None, os="Linux", arch="x86_64")
        models = get_recommended_models(hw)

        assert len(models) > 0
        for m in models:
            assert m["min_ram_gb"] <= hw.ram_gb

    def test_recommended_models_intermediate(self):
        hw = HardwareInfo(ram_gb=16, cpu_cores=8, gpu=None, os="Linux", arch="x86_64")
        models = get_recommended_models(hw)

        assert len(models) > 0
        # Should include basic + intermediate models
        names = [m["name"] for m in models]
        assert "qwen2.5:7b" in names  # recommended model

    def test_recommended_models_never_exceed_ram(self):
        hw = HardwareInfo(ram_gb=8, cpu_cores=4, gpu=None, os="Linux", arch="x86_64")
        models = get_recommended_models(hw)

        for m in models:
            assert m["min_ram_gb"] <= hw.ram_gb

    def test_model_tiers_have_required_fields(self):
        for tier_name, tier_models in MODEL_TIERS.items():
            for m in tier_models:
                assert "name" in m, f"Missing 'name' in {tier_name}"
                assert "display_name" in m, f"Missing 'display_name' in {tier_name}"
                assert "size_gb" in m, f"Missing 'size_gb' in {tier_name}"
                assert "min_ram_gb" in m, f"Missing 'min_ram_gb' in {tier_name}"


class TestCloudProviders:
    """Test cloud provider configuration."""

    def test_all_providers_have_required_fields(self):
        for name, provider in PROVIDERS.items():
            assert "name" in provider, f"Missing 'name' in {name}"
            assert "base_url" in provider, f"Missing 'base_url' in {name}"
            assert "default_model" in provider, f"Missing 'default_model' in {name}"
            assert "models" in provider, f"Missing 'models' in {name}"
            assert len(provider["models"]) > 0, f"No models in {name}"

    def test_provider_names(self):
        assert "openai" in PROVIDERS
        assert "anthropic" in PROVIDERS
        assert "groq" in PROVIDERS
        assert "mistral" in PROVIDERS
