"""PureQL Core — Data cleaning + SQL optimization engine."""

__version__ = "0.1.0"

from pureql.ingestion.loader import load
from pureql.profiling.profiler import profile
from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, auto_clean, filter_rows,
    drop_columns, rename_column,
    fill_nulls_ml, deduplicate_semantic, export_pipeline,
)
from pureql.sql import generate_schema, optimize_query, run_query
from pureql.versioning import VersionStore
from pureql.database import (
    connect as db_connect, build_uri, test_connection,
    get_tables, read_table, read_query, write_table,
    ConnectionStore,
)
from pureql.ai.keychain import save_api_key, get_api_key, delete_api_key, has_api_key

__all__ = [
    "load", "profile",
    "deduplicate", "standardize", "fix_formats", "fill_nulls",
    "remove_outliers", "auto_clean", "filter_rows",
    "drop_columns", "rename_column",
    "fill_nulls_ml", "deduplicate_semantic", "export_pipeline",
    "generate_schema", "optimize_query", "run_query",
    "VersionStore",
    "db_connect", "build_uri", "test_connection",
    "get_tables", "read_table", "read_query", "write_table", "ConnectionStore",
    "save_api_key", "get_api_key", "delete_api_key", "has_api_key",
]
