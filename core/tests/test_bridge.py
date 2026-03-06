"""Tests for PureQL Bridge Server."""

import json
import tempfile
import threading
import time
from http.server import HTTPServer
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

import polars as pl
import pytest

from pureql.bridge import PureQLHandler, state


@pytest.fixture(autouse=True)
def reset_state():
    """Reset global state before each test."""
    state.reset()
    state.ai_model = "qwen2.5:7b"
    state.ai_provider = "ollama"
    state.ai_api_key = None
    yield
    state.reset()


@pytest.fixture
def server():
    """Start a test HTTP server on a random port."""
    srv = HTTPServer(("127.0.0.1", 0), PureQLHandler)
    port = srv.server_address[1]
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    srv.shutdown()


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    """Create a sample CSV for testing."""
    path = tmp_path / "test.csv"
    df = pl.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "name": ["Alice", "Bob", "Charlie", None, "Eve"],
        "city": ["Bogota", "bogota", "BOGOTA", "Medellin", "Cali"],
        "amount": [100.0, 200.0, 150.0, 300.0, 50.0],
    })
    df.write_csv(path)
    return path


def _post(base_url: str, path: str, data: dict = None) -> dict:
    """Helper to make POST requests to the test server."""
    body = json.dumps(data or {}).encode()
    req = Request(
        f"{base_url}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def _get(base_url: str, path: str) -> dict:
    """Helper to make GET requests."""
    req = Request(f"{base_url}{path}", method="GET")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


class TestBridgeHealth:
    def test_health_check(self, server):
        result = _get(server, "/health")
        assert result["status"] == "ok"
        assert "version" in result

    def test_state_empty(self, server):
        result = _get(server, "/state")
        assert result["hasDataset"] is False


class TestBridgeLoad:
    def test_load_csv(self, server, sample_csv):
        result = _post(server, "/load", {"path": str(sample_csv)})
        assert result["success"] is True
        assert result["datasetName"] == "test.csv"
        assert result["profile"]["rowCount"] == 5
        assert len(result["preview"]) == 5
        assert len(result["versions"]) == 1

    def test_load_updates_state(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        state_result = _get(server, "/state")
        assert state_result["hasDataset"] is True
        assert state_result["datasetName"] == "test.csv"

    def test_load_missing_path(self, server):
        from urllib.error import HTTPError
        with pytest.raises(HTTPError) as exc_info:
            _post(server, "/load", {})
        assert exc_info.value.code == 400


class TestBridgePreview:
    def test_preview_after_load(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/preview", {"rows": 3})
        assert len(result["preview"]) == 3

    def test_preview_no_dataset(self, server):
        from urllib.error import HTTPError
        with pytest.raises(HTTPError) as exc_info:
            _post(server, "/preview", {})
        assert exc_info.value.code == 400


class TestBridgeExecute:
    def test_deduplicate(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/execute", {
            "type": "deduplicate",
            "params": {"strategy": "exact"},
        })
        assert result["success"] is True
        assert "versions" in result

    def test_fill_nulls(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/execute", {
            "type": "fill_nulls",
            "params": {"strategy": "mode"},
        })
        assert result["success"] is True

    def test_standardize(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/execute", {
            "type": "standardize",
            "params": {"method": "titlecase"},
            "target": "column:city",
        })
        assert result["success"] is True

    def test_profile_action(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/execute", {"type": "profile"})
        assert result["success"] is True
        assert "profile" in result

    def test_unknown_action(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/execute", {"type": "magic_action"})
        assert result["success"] is False


class TestBridgeVersioning:
    def test_versions_after_operations(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        _post(server, "/execute", {"type": "deduplicate", "params": {"strategy": "exact"}})
        _post(server, "/execute", {"type": "fill_nulls", "params": {"strategy": "mode"}})

        result = _post(server, "/versions")
        assert len(result["versions"]) == 3  # load + dedup + fill

    def test_undo(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        _post(server, "/execute", {"type": "fill_nulls", "params": {"strategy": "mode"}})

        result = _post(server, "/undo")
        assert result["success"] is True

    def test_redo(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        _post(server, "/execute", {"type": "fill_nulls", "params": {"strategy": "mode"}})
        _post(server, "/undo")

        result = _post(server, "/redo")
        assert result["success"] is True


class TestBridgeSQL:
    def test_generate_schema(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/schema", {"tableName": "sales", "engine": "postgresql"})
        assert "CREATE TABLE sales" in result["sql"]

    def test_optimize_query(self, server):
        result = _post(server, "/optimize", {
            "query": "SELECT * FROM orders WHERE date > '2024-01-01'",
        })
        assert "sql" in result

    def test_run_query(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/query", {
            "query": "SELECT city, COUNT(*) as cnt FROM data GROUP BY city",
            "tableName": "data",
        })
        assert result["success"] is True
        assert result["rowCount"] > 0


class TestBridgeAutoClean:
    def test_auto_clean(self, server, sample_csv):
        _post(server, "/load", {"path": str(sample_csv)})
        result = _post(server, "/auto-clean")
        assert result["success"] is True
        assert "qualityScore" in result
        assert "operations" in result


class TestBridgeSettings:
    def test_update_model(self, server):
        result = _post(server, "/settings", {"model": "mistral:7b"})
        assert result["model"] == "mistral:7b"

    def test_update_provider(self, server):
        result = _post(server, "/settings", {"provider": "openai", "apiKey": "sk-test123"})
        assert result["provider"] == "openai"
        assert result["hasApiKey"] is True


class TestBridgeHardware:
    def test_detect_hardware(self, server):
        result = _post(server, "/hardware")
        assert "hardware" in result
        assert result["hardware"]["ramGb"] > 0
        assert "recommendedModels" in result
        assert len(result["recommendedModels"]) > 0
