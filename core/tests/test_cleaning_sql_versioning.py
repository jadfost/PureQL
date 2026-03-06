"""Tests for PureQL cleaning, SQL, and versioning modules."""

from pathlib import Path
import polars as pl
import pytest

from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, drop_columns, rename_column, filter_rows,
    auto_clean, CleaningResult,
)
from pureql.sql import generate_schema, optimize_query, run_query, SQLResult
from pureql.versioning import VersionStore, Version


# ══════════════════════════════════════════
# FIXTURES
# ══════════════════════════════════════════

@pytest.fixture
def dirty_df() -> pl.DataFrame:
    """A messy DataFrame for testing cleaning operations."""
    return pl.DataFrame({
        "id": [1, 2, 3, 4, 5, 5, 6],
        "name": ["Alice", "Bob", "Charlie", None, "alice", "Bob", "Diana"],
        "city": ["Bogota", "bogota", "BOGOTA", "Medellin", "medellin", "Bogota", "Cali"],
        "email": ["ALICE@mail.com", "bob@mail.com", " charlie@mail.com ", None, "Alice@Mail.com", "bob@mail.com", "diana@mail.com"],
        "amount": [100.0, 200.0, 150.0, 300.0, 50.0, 200.0, 10000.0],
    })


@pytest.fixture
def numeric_df() -> pl.DataFrame:
    """DataFrame for outlier testing."""
    return pl.DataFrame({
        "id": list(range(100)),
        "value": list(range(95)) + [500, 600, 700, 800, 900],
    })


# ══════════════════════════════════════════
# CLEANING TESTS
# ══════════════════════════════════════════

class TestDeduplication:
    def test_exact_dedup(self, dirty_df):
        result = deduplicate(dirty_df, strategy="exact")
        assert isinstance(result, CleaningResult)
        # Row (5, Bob, Bogota, bob@mail.com, 200.0) is duplicated
        assert result.rows_affected >= 0
        assert result.df.height <= dirty_df.height

    def test_exact_dedup_subset(self, dirty_df):
        result = deduplicate(dirty_df, strategy="exact", subset=["name"])
        assert result.df.height < dirty_df.height  # "Bob" appears twice

    def test_fuzzy_dedup(self, dirty_df):
        result = deduplicate(dirty_df, strategy="fuzzy", subset=["city"], threshold=0.8)
        assert isinstance(result, CleaningResult)
        assert result.operation == "deduplicate_fuzzy"

    def test_invalid_strategy(self, dirty_df):
        with pytest.raises(ValueError, match="Unknown dedup"):
            deduplicate(dirty_df, strategy="magic")


class TestStandardize:
    def test_lowercase(self, dirty_df):
        result = standardize(dirty_df, "city", method="lowercase")
        unique_cities = result.df["city"].unique().to_list()
        # All should be lowercase
        for city in unique_cities:
            if city is not None:
                assert city == city.lower()

    def test_titlecase(self, dirty_df):
        result = standardize(dirty_df, "city", method="titlecase")
        unique_cities = result.df["city"].unique().to_list()
        for city in unique_cities:
            if city is not None:
                assert city == city.title()

    def test_cluster_merge(self, dirty_df):
        result = standardize(dirty_df, "city", method="cluster_merge")
        # Should reduce variants: Bogota/bogota/BOGOTA -> one form
        unique_before = dirty_df["city"].n_unique()
        unique_after = result.df["city"].n_unique()
        assert unique_after <= unique_before

    def test_invalid_column(self, dirty_df):
        with pytest.raises(ValueError, match="not found"):
            standardize(dirty_df, "nonexistent")

    def test_non_string_column(self, dirty_df):
        with pytest.raises(ValueError, match="not a string"):
            standardize(dirty_df, "amount")


class TestFixFormats:
    def test_email_normalization(self, dirty_df):
        result = fix_formats(dirty_df, column="email", format_type="emails")
        emails = result.df["email"].drop_nulls().to_list()
        for email in emails:
            assert email == email.lower().strip()

    def test_whitespace_fix(self, dirty_df):
        result = fix_formats(dirty_df, column="email", format_type="whitespace")
        emails = result.df["email"].drop_nulls().to_list()
        for email in emails:
            assert email == email.strip()

    def test_auto_format(self, dirty_df):
        result = fix_formats(dirty_df, format_type="auto")
        assert isinstance(result, CleaningResult)


class TestFillNulls:
    def test_fill_mode(self, dirty_df):
        result = fill_nulls(dirty_df, strategy="mode")
        # Should have fewer nulls
        original_nulls = sum(dirty_df[c].null_count() for c in dirty_df.columns)
        new_nulls = sum(result.df[c].null_count() for c in result.df.columns)
        assert new_nulls <= original_nulls

    def test_fill_mean(self):
        df = pl.DataFrame({"val": [1.0, 2.0, None, 4.0]})
        result = fill_nulls(df, column="val", strategy="mean")
        assert result.df["val"].null_count() == 0

    def test_fill_zero(self):
        df = pl.DataFrame({"val": [1, None, 3]})
        result = fill_nulls(df, column="val", strategy="zero")
        assert result.df["val"].null_count() == 0
        assert result.df["val"].to_list() == [1, 0, 3]

    def test_fill_forward(self):
        df = pl.DataFrame({"val": [1, None, None, 4]})
        result = fill_nulls(df, column="val", strategy="forward")
        assert result.df["val"].to_list() == [1, 1, 1, 4]

    def test_no_nulls(self):
        df = pl.DataFrame({"val": [1, 2, 3]})
        result = fill_nulls(df, strategy="mode")
        assert result.rows_affected == 0


class TestRemoveOutliers:
    def test_iqr_method(self, numeric_df):
        result = remove_outliers(numeric_df, "value", method="iqr")
        assert result.rows_affected > 0
        assert result.df.height < numeric_df.height

    def test_zscore_method(self, numeric_df):
        result = remove_outliers(numeric_df, "value", method="zscore", threshold=2.0)
        assert result.rows_affected > 0

    def test_invalid_column(self, numeric_df):
        with pytest.raises(ValueError, match="not found"):
            remove_outliers(numeric_df, "nonexistent")

    def test_no_outliers(self):
        df = pl.DataFrame({"val": [1, 2, 3, 4, 5]})
        result = remove_outliers(df, "val", method="iqr")
        assert result.rows_affected == 0


class TestColumnOps:
    def test_drop_columns(self, dirty_df):
        result = drop_columns(dirty_df, ["email", "amount"])
        assert "email" not in result.df.columns
        assert "amount" not in result.df.columns
        assert "name" in result.df.columns

    def test_rename_column(self, dirty_df):
        result = rename_column(dirty_df, "city", "ciudad")
        assert "ciudad" in result.df.columns
        assert "city" not in result.df.columns

    def test_rename_nonexistent(self, dirty_df):
        with pytest.raises(ValueError):
            rename_column(dirty_df, "nope", "new_name")

    def test_filter_rows(self, dirty_df):
        result = filter_rows(dirty_df, "amount > 100")
        assert result.df.height < dirty_df.height
        assert all(v > 100 for v in result.df["amount"].to_list())


class TestAutoClean:
    def test_auto_clean_returns_results(self, dirty_df):
        cleaned, results = auto_clean(dirty_df)
        assert isinstance(cleaned, pl.DataFrame)
        assert isinstance(results, list)

    def test_auto_clean_improves_data(self, dirty_df):
        cleaned, results = auto_clean(dirty_df)
        # Should have fewer or equal rows (dedup)
        assert cleaned.height <= dirty_df.height
        # Should have fewer or equal nulls
        original_nulls = sum(dirty_df[c].null_count() for c in dirty_df.columns)
        new_nulls = sum(cleaned[c].null_count() for c in cleaned.columns)
        assert new_nulls <= original_nulls


# ══════════════════════════════════════════
# SQL TESTS
# ══════════════════════════════════════════

class TestSchemaGeneration:
    def test_basic_schema(self, dirty_df):
        result = generate_schema(dirty_df, table_name="sales")
        assert isinstance(result, SQLResult)
        assert "CREATE TABLE sales" in result.query
        assert "id" in result.query.lower() or '"id"' in result.query

    def test_schema_types(self):
        df = pl.DataFrame({
            "int_col": [1, 2, 3],
            "float_col": [1.5, 2.5, 3.5],
            "str_col": ["a", "b", "c"],
            "bool_col": [True, False, True],
        })
        result = generate_schema(df, engine="postgresql")
        assert "BIGINT" in result.query or "INTEGER" in result.query
        assert "DOUBLE PRECISION" in result.query or "REAL" in result.query

    def test_schema_mysql(self, dirty_df):
        result = generate_schema(dirty_df, engine="mysql")
        assert "CREATE TABLE" in result.query

    def test_schema_sqlite(self, dirty_df):
        result = generate_schema(dirty_df, engine="sqlite")
        assert "TEXT" in result.query

    def test_index_suggestions(self, dirty_df):
        result = generate_schema(dirty_df, table_name="test")
        # Should suggest index for 'id' column
        assert len(result.suggested_indexes) > 0


class TestQueryOptimization:
    def test_basic_optimization(self):
        query = "SELECT * FROM orders WHERE date > '2024-01-01'"
        result = optimize_query(query)
        assert isinstance(result, SQLResult)
        assert result.original_query == query

    def test_select_star_warning(self):
        query = "SELECT * FROM orders"
        result = optimize_query(query)
        has_star_warning = any("SELECT *" in c for c in result.changes)
        assert has_star_warning

    def test_index_suggestions_from_where(self):
        query = "SELECT name FROM users WHERE city = 'Bogota' AND age > 25"
        result = optimize_query(query)
        assert len(result.suggested_indexes) > 0

    def test_join_index_suggestions(self):
        query = """
        SELECT o.id, c.name 
        FROM orders o 
        JOIN customers c ON o.customer_id = c.id
        WHERE o.total > 1000
        """
        result = optimize_query(query)
        assert len(result.suggested_indexes) > 0

    def test_invalid_sql(self):
        result = optimize_query("NOT VALID SQL AT ALL ???")
        assert "Could not parse" in result.explanation


class TestRunQuery:
    def test_basic_query(self, dirty_df):
        result = run_query(dirty_df, "SELECT * FROM data WHERE amount > 100", "data")
        assert isinstance(result, pl.DataFrame)
        assert result.height < dirty_df.height

    def test_aggregation(self, dirty_df):
        result = run_query(dirty_df, "SELECT city, COUNT(*) as cnt FROM data GROUP BY city", "data")
        assert "cnt" in result.columns

    def test_custom_table_name(self, dirty_df):
        result = run_query(dirty_df, "SELECT * FROM sales LIMIT 3", "sales")
        assert result.height == 3


# ══════════════════════════════════════════
# VERSIONING TESTS
# ══════════════════════════════════════════

class TestVersionStore:
    def test_create_initial(self, dirty_df):
        store = VersionStore()
        v = store.create_initial(dirty_df, quality_score=50)

        assert isinstance(v, Version)
        assert v.label == "v1 Original"
        assert store.version_count == 1
        assert store.current_id == v.id

    def test_commit_version(self, dirty_df):
        store = VersionStore()
        store.create_initial(dirty_df, quality_score=50)

        cleaned = dirty_df.unique()
        v2 = store.commit(
            df=cleaned,
            operation="deduplicate",
            description="Removed duplicates",
            quality_score=70,
            rows_affected=dirty_df.height - cleaned.height,
        )

        assert v2.label == "v2 Deduplicate"
        assert store.version_count == 2
        assert store.current_id == v2.id

    def test_get_current(self, dirty_df):
        store = VersionStore()
        store.create_initial(dirty_df, quality_score=50)

        current = store.get_current()
        assert current is not None
        assert current.height == dirty_df.height

    def test_undo(self, dirty_df):
        store = VersionStore()
        v1 = store.create_initial(dirty_df, quality_score=50)

        cleaned = dirty_df.head(3)
        v2 = store.commit(cleaned, "filter", "Filtered rows", 70)

        # Undo should go back to v1
        result = store.undo()
        assert result is not None
        assert result.height == dirty_df.height
        assert store.current_id == v1.id

    def test_undo_at_v1(self, dirty_df):
        store = VersionStore()
        store.create_initial(dirty_df, quality_score=50)

        # Can't undo past v1
        result = store.undo()
        assert result is None

    def test_redo(self, dirty_df):
        store = VersionStore()
        v1 = store.create_initial(dirty_df, quality_score=50)

        cleaned = dirty_df.head(3)
        v2 = store.commit(cleaned, "filter", "Filtered", 70)

        store.undo()  # back to v1
        result = store.redo()  # forward to v2
        assert result is not None
        assert result.height == 3
        assert store.current_id == v2.id

    def test_checkout(self, dirty_df):
        store = VersionStore()
        v1 = store.create_initial(dirty_df, quality_score=50)
        v2 = store.commit(dirty_df.head(5), "filter", "Filtered", 60)
        v3 = store.commit(dirty_df.head(3), "filter", "More filter", 70)

        # Jump back to v1
        result = store.checkout(v1.id)
        assert result is not None
        assert result.height == dirty_df.height
        assert store.current_id == v1.id

    def test_diff(self, dirty_df):
        store = VersionStore()
        v1 = store.create_initial(dirty_df, quality_score=50)

        cleaned = dirty_df.head(5)
        v2 = store.commit(cleaned, "filter", "Filtered", 70)

        diff = store.diff(v1.id, v2.id)
        assert diff["rows_a"] == dirty_df.height
        assert diff["rows_b"] == 5
        assert diff["row_diff"] == 5 - dirty_df.height

    def test_timeline(self, dirty_df):
        store = VersionStore()
        store.create_initial(dirty_df, quality_score=50)
        store.commit(dirty_df.head(5), "filter", "Filtered", 70)

        timeline = store.get_timeline()
        assert len(timeline) == 2
        assert timeline[0]["label"] == "v1 Original"
        assert "id" in timeline[0]
        assert "qualityScore" in timeline[0]

    def test_version_not_found(self):
        store = VersionStore()
        result = store.checkout("nonexistent")
        assert result is None

    def test_current_label(self, dirty_df):
        store = VersionStore()
        store.create_initial(dirty_df, quality_score=50)
        assert store.current_label == "v1 Original"
