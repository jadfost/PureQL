"""Tests for new PureQL features: ML imputation, semantic dedup, pipeline exporter, keychain."""

import pytest
import polars as pl
import tempfile
from pathlib import Path


# ── ML Imputation ──────────────────────────────────────────────────────────────

class TestMLImputation:
    @pytest.fixture
    def df_with_nulls(self):
        return pl.DataFrame({
            "age": [25, None, 35, 40, None, 28, 32],
            "salary": [50000.0, 60000.0, None, 80000.0, 55000.0, None, 70000.0],
            "score": [0.8, 0.7, 0.9, None, 0.6, 0.85, None],
            "name": ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace"],
        })

    def test_ml_imputation_knn_fills_nulls(self, df_with_nulls):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        result, stats = fill_nulls_ml(df_with_nulls, strategy="knn")
        # All numeric nulls should be filled
        assert result["age"].null_count() == 0
        assert result["salary"].null_count() == 0
        assert result["score"].null_count() == 0
        # String column unchanged
        assert result["name"].null_count() == 0

    def test_ml_imputation_returns_stats(self, df_with_nulls):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        _, stats = fill_nulls_ml(df_with_nulls, strategy="knn")
        assert "imputed" in stats
        assert "rows_changed" in stats
        assert stats["rows_changed"] > 0

    def test_ml_imputation_specific_column(self, df_with_nulls):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        result, stats = fill_nulls_ml(df_with_nulls, column="age", strategy="knn")
        assert result["age"].null_count() == 0
        # Other nulls untouched
        assert result["salary"].null_count() > 0

    def test_ml_imputation_no_nulls(self):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        df = pl.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
        result, stats = fill_nulls_ml(df)
        assert result.equals(df)
        assert stats["rows_changed"] == 0

    def test_ml_imputation_no_numeric_columns(self):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        df = pl.DataFrame({"name": ["Alice", None, "Charlie"]})
        result, stats = fill_nulls_ml(df)
        # Should return unchanged (no numeric columns to impute from)
        assert result.height == 3

    def test_ml_imputation_preserves_original_dtype(self, df_with_nulls):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        original_dtype = df_with_nulls["age"].dtype
        result, _ = fill_nulls_ml(df_with_nulls, strategy="knn")
        assert result["age"].dtype == original_dtype

    def test_ml_imputation_rf_strategy(self, df_with_nulls):
        from pureql.cleaning.ml_imputation import fill_nulls_ml
        result, stats = fill_nulls_ml(df_with_nulls, strategy="rf")
        assert stats["strategy"] in ("rf", "fallback_mode")
        assert result["age"].null_count() == 0


# ── Semantic Deduplication ─────────────────────────────────────────────────────

class TestSemanticDedup:
    @pytest.fixture
    def df_near_dupes(self):
        return pl.DataFrame({
            "name": ["John Smith", "Jon Smith", "John Smyth", "Alice Johnson", "Alice Johnsn"],
            "city": ["New York", "New York", "New York", "Chicago", "Chicago"],
        })

    @pytest.fixture
    def df_exact_dupes(self):
        return pl.DataFrame({
            "product": ["Widget A", "Widget A", "Widget B", "Widget B", "Widget C"],
            "price": [10.0, 10.0, 20.0, 20.0, 30.0],
        })

    def test_semantic_dedup_removes_near_dupes(self, df_near_dupes):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        result, stats = deduplicate_semantic(df_near_dupes, threshold=0.85)
        assert result.height < df_near_dupes.height
        assert stats["removed"] > 0

    def test_semantic_dedup_returns_stats(self, df_near_dupes):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        _, stats = deduplicate_semantic(df_near_dupes)
        assert "removed" in stats
        assert "original_rows" in stats
        assert "remaining_rows" in stats
        assert "strategy" in stats
        assert stats["strategy"] == "semantic"

    def test_semantic_dedup_high_threshold_keeps_more(self, df_near_dupes):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        result_strict, _ = deduplicate_semantic(df_near_dupes, threshold=0.99)
        result_loose, _ = deduplicate_semantic(df_near_dupes, threshold=0.70)
        assert result_strict.height >= result_loose.height

    def test_semantic_dedup_no_text_columns(self):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        df = pl.DataFrame({"a": [1, 2, 3], "b": [4.0, 5.0, 6.0]})
        result, stats = deduplicate_semantic(df)
        assert result.height == df.height
        assert stats["removed"] == 0

    def test_semantic_dedup_subset_columns(self, df_near_dupes):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        result, stats = deduplicate_semantic(df_near_dupes, subset=["name"], threshold=0.85)
        assert result.height <= df_near_dupes.height
        assert stats["columns_used"] == ["name"]

    def test_semantic_dedup_preserves_shape(self, df_near_dupes):
        from pureql.cleaning.semantic_dedup import deduplicate_semantic
        result, _ = deduplicate_semantic(df_near_dupes)
        assert result.width == df_near_dupes.width
        assert result.columns == df_near_dupes.columns


# ── Pipeline Exporter ──────────────────────────────────────────────────────────

class TestPipelineExporter:
    @pytest.fixture
    def sample_versions(self):
        return [
            {
                "id": "v1",
                "label": "v1 Original",
                "description": "Dataset loaded: 1000 rows x 5 columns.",
                "operation": "load",
                "rowsAffected": 1000,
                "qualityScore": 55,
                "timestamp": 1700000000,
                "parentId": None,
            },
            {
                "id": "v2",
                "label": "v2 Deduplicate",
                "description": "Removed 42 exact duplicate rows.",
                "operation": "deduplicate_exact",
                "rowsAffected": 42,
                "qualityScore": 68,
                "timestamp": 1700000100,
                "parentId": "v1",
            },
            {
                "id": "v3",
                "label": "v3 Fix Formats",
                "description": "'email': 18 emails normalized",
                "operation": "fix_formats",
                "rowsAffected": 18,
                "qualityScore": 75,
                "timestamp": 1700000200,
                "parentId": "v2",
            },
            {
                "id": "v4",
                "label": "v4 Fill Nulls",
                "description": "'salary': 23 nulls filled (mode)",
                "operation": "fill_nulls",
                "rowsAffected": 23,
                "qualityScore": 88,
                "timestamp": 1700000300,
                "parentId": "v3",
            },
        ]

    def test_export_pipeline_returns_string(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions)
        assert isinstance(script, str)
        assert len(script) > 100

    def test_export_pipeline_has_imports(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions)
        assert "import polars as pl" in script

    def test_export_pipeline_has_steps(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions)
        assert "Step 2" in script
        assert "Step 3" in script
        assert "Step 4" in script

    def test_export_pipeline_has_dedup_code(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions)
        assert "unique" in script  # polars dedup method

    def test_export_pipeline_has_load_stub(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions, source_path="/data/sales.csv")
        assert "sales.csv" in script
        assert "read_csv" in script

    def test_export_pipeline_has_output(self, sample_versions):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline(sample_versions)
        assert "write_parquet" in script or "write_csv" in script

    def test_export_pipeline_saves_to_file(self, sample_versions, tmp_path):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        out_path = str(tmp_path / "pipeline.py")
        script = export_pipeline(sample_versions, output_path=out_path)
        assert Path(out_path).exists()
        content = Path(out_path).read_text(encoding="utf-8")
        assert content == script

    def test_export_pipeline_no_versions(self):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        script = export_pipeline([])
        assert "import polars" in script

    def test_export_pipeline_ml_imputation(self):
        from pureql.cleaning.pipeline_exporter import export_pipeline
        versions = [
            {"id": "v1", "label": "v1 Original", "operation": "load",
             "description": "loaded", "rowsAffected": 100, "qualityScore": 50,
             "timestamp": 0, "parentId": None},
            {"id": "v2", "label": "v2 ML Impute", "operation": "fill_nulls_ml",
             "description": "ML imputation: 10 values filled.", "rowsAffected": 10,
             "qualityScore": 75, "timestamp": 1, "parentId": "v1"},
        ]
        script = export_pipeline(versions)
        assert "KNNImputer" in script or "fill_null" in script


# ── Keychain ───────────────────────────────────────────────────────────────────

class TestKeychain:
    def test_save_and_get_key(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        keychain.save_api_key("test_provider", "sk-test123")
        retrieved = keychain.get_api_key("test_provider")
        assert retrieved == "sk-test123"

    def test_has_api_key(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        assert not keychain.has_api_key("nonexistent")
        keychain.save_api_key("openai", "sk-abc")
        assert keychain.has_api_key("openai")

    def test_delete_key(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        keychain.save_api_key("anthropic", "sk-ant-xxx")
        assert keychain.has_api_key("anthropic")
        keychain.delete_api_key("anthropic")
        assert not keychain.has_api_key("anthropic")

    def test_get_nonexistent_returns_none(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        result = keychain.get_api_key("groq")
        assert result is None

    def test_overwrite_key(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        keychain.save_api_key("groq", "old-key")
        keychain.save_api_key("groq", "new-key")
        assert keychain.get_api_key("groq") == "new-key"

    def test_multiple_providers(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        keychain.save_api_key("openai", "key-openai")
        keychain.save_api_key("anthropic", "key-anthropic")
        keychain.save_api_key("groq", "key-groq")

        assert keychain.get_api_key("openai") == "key-openai"
        assert keychain.get_api_key("anthropic") == "key-anthropic"
        assert keychain.get_api_key("groq") == "key-groq"

    def test_obfuscation_not_plaintext(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        store_path = tmp_path / ".keys"
        monkeypatch.setattr(keychain, "_get_store_path", lambda: store_path)

        secret = "sk-super-secret-key-12345"
        keychain.save_api_key("openai", secret)

        raw_bytes = store_path.read_bytes()
        assert secret.encode() not in raw_bytes  # Key must not appear in plaintext

    def test_list_stored_providers(self, tmp_path, monkeypatch):
        from pureql.ai import keychain
        monkeypatch.setattr(keychain, "_get_store_path", lambda: tmp_path / ".keys")

        keychain.save_api_key("openai", "key1")
        keychain.save_api_key("groq", "key2")
        stored = keychain.list_stored_providers()
        assert "openai" in stored
        assert "groq" in stored


# ── Bridge Diff Endpoint ───────────────────────────────────────────────────────

class TestBridgeDiff:
    def test_diff_endpoint_exists(self):
        """Test that the diff handler is wired in the bridge."""
        from pureql.bridge import PureQLHandler
        assert hasattr(PureQLHandler, "_handle_diff")

    def test_diff_two_versions(self):
        from pureql.bridge import state
        import polars as pl

        # Set up two different DataFrames in version store
        df1 = pl.DataFrame({"a": [1, 2, 3, 4, 5], "b": ["x", "y", "z", "w", "v"]})
        df2 = pl.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})  # 2 rows removed

        state.reset()
        v1 = state.store.create_initial(df1, quality_score=60)
        v2 = state.store.commit(df2, "filter", "Removed 2 rows.", 70, 2)

        diff = state.store.diff(v1.id, v2.id)
        assert diff["row_diff"] == -2
        assert diff["rows_a"] == 5
        assert diff["rows_b"] == 3
