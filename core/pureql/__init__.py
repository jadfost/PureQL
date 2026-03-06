"""PureQL Core — Data cleaning + SQL optimization engine."""

__version__ = "0.1.0"

from pureql.ingestion.loader import load
from pureql.profiling.profiler import profile
from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, auto_clean, filter_rows,
    drop_columns, rename_column,
)
from pureql.sql import generate_schema, optimize_query, run_query
from pureql.versioning import VersionStore
from pureql.database import (
    connect as db_connect, build_uri, test_connection,
    get_tables, read_table, read_query, write_table,
    ConnectionStore,
)

__all__ = [
    "load", "profile",
    "deduplicate", "standardize", "fix_formats", "fill_nulls",
    "remove_outliers", "auto_clean", "filter_rows",
    "drop_columns", "rename_column",
    "generate_schema", "optimize_query", "run_query",
    "VersionStore",
]
