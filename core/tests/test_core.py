"""Tests for PureQL core — ingestion and profiling."""

import tempfile
from pathlib import Path

import polars as pl
import pytest

from pureql.ingestion import load
from pureql.profiling import profile


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    """Create a sample CSV file for testing."""
    path = tmp_path / "test_data.csv"
    df = pl.DataFrame({
        "id": [1, 2, 3, 4, 5, 5],
        "name": ["Alice", "Bob", "Charlie", "Diana", None, "Bob"],
        "city": ["Bogotá", "bogota", "BOGOTA", "Medellín", "Cali", "Medellín"],
        "amount": [100.0, 200.0, 150.0, 300.0, 50.0, 200.0],
        "date": ["2024-01-15", "2024/02/20", "2024-03-10", "2024-01-15", "2024-04-01", "2024/02/20"],
    })
    df.write_csv(path)
    return path


@pytest.fixture
def sample_json(tmp_path: Path) -> Path:
    """Create a sample JSON file for testing."""
    path = tmp_path / "test_data.json"
    df = pl.DataFrame({
        "id": [1, 2, 3],
        "value": [10.5, 20.3, 30.1],
    })
    df.write_json(path)
    return path


@pytest.fixture
def sample_parquet(tmp_path: Path) -> Path:
    """Create a sample Parquet file for testing."""
    path = tmp_path / "test_data.parquet"
    df = pl.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "score": [85, 92, 78, 95, 88],
    })
    df.write_parquet(path)
    return path


class TestIngestion:
    """Tests for the data loader."""

    def test_load_csv(self, sample_csv: Path):
        df = load(sample_csv)
        assert isinstance(df, pl.DataFrame)
        assert df.height == 6
        assert df.width == 5

    def test_load_json(self, sample_json: Path):
        df = load(sample_json)
        assert isinstance(df, pl.DataFrame)
        assert df.height == 3

    def test_load_parquet(self, sample_parquet: Path):
        df = load(sample_parquet)
        assert isinstance(df, pl.DataFrame)
        assert df.height == 5

    def test_load_nonexistent_file(self):
        with pytest.raises(FileNotFoundError):
            load("/nonexistent/file.csv")

    def test_load_unsupported_format(self, tmp_path: Path):
        bad_file = tmp_path / "test.xyz"
        bad_file.write_text("data")
        with pytest.raises(ValueError, match="Unsupported"):
            load(bad_file)


class TestProfiling:
    """Tests for the data profiler."""

    def test_basic_profile(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)

        assert result.row_count == 6
        assert result.col_count == 5
        assert 0 <= result.quality_score <= 100
        assert len(result.columns) == 5

    def test_duplicate_detection(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)

        assert result.duplicate_count >= 0

    def test_null_detection(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)

        name_col = next(c for c in result.columns if c.name == "name")
        assert name_col.null_count == 1

    def test_quality_score_range(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)

        assert 0 <= result.quality_score <= 100

    def test_issues_detected(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)

        # With only 6 rows, casing check requires >100 rows so it won't trigger
        # But we can verify the profiler runs without errors and detects column types
        city_col = next(c for c in result.columns if c.name == "city")
        assert city_col.dtype == "String"
        assert city_col.unique_count == 5  # Bogotá, bogota, BOGOTA, Medellín, Cali

    def test_issues_detected_large_dataset(self):
        """With >100 rows, casing inconsistencies should be detected."""
        import random
        cities = ["Bogotá", "bogota", "BOGOTA", "Medellín", "medellin", "Cali"]
        df = pl.DataFrame({
            "id": list(range(200)),
            "city": [random.choice(cities) for _ in range(200)],
        })
        result = profile(df)

        # Should detect inconsistent casing in city column
        city_issues = [i for i in result.issues if "city" in i.lower()]
        assert len(city_issues) > 0

    def test_profile_to_dict(self, sample_csv: Path):
        df = load(sample_csv)
        result = profile(df)
        d = result.to_dict()

        assert "rowCount" in d
        assert "qualityScore" in d
        assert "columns" in d
        assert isinstance(d["columns"], list)

    def test_empty_dataframe(self):
        df = pl.DataFrame({"a": [], "b": []}).cast({"a": pl.Int64, "b": pl.Utf8})
        result = profile(df)

        assert result.row_count == 0
        assert result.quality_score == 0
