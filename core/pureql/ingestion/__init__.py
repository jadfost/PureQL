"""Universal data loader — auto-detects format and loads into Polars DataFrame."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import polars as pl


SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx", ".xls"}


def load(
    source: str | Path,
    *,
    sheet_name: Optional[str] = None,
    infer_schema_length: int = 10000,
    n_rows: Optional[int] = None,
) -> pl.DataFrame:
    """Load data from a file path into a Polars DataFrame.

    Automatically detects the format based on file extension.

    Args:
        source: Path to the data file.
        sheet_name: For Excel files, which sheet to load. Default is the first.
        infer_schema_length: Number of rows to use for schema inference.
        n_rows: Maximum number of rows to load (None = all).

    Returns:
        A Polars DataFrame with the loaded data.

    Raises:
        FileNotFoundError: If the source file does not exist.
        ValueError: If the file extension is not supported.
    """
    path = Path(source)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    ext = path.suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format: '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    if ext == ".csv":
        return pl.read_csv(
            path,
            infer_schema_length=infer_schema_length,
            n_rows=n_rows,
            try_parse_dates=True,
        )

    if ext == ".tsv":
        return pl.read_csv(
            path,
            separator="\t",
            infer_schema_length=infer_schema_length,
            n_rows=n_rows,
            try_parse_dates=True,
        )

    if ext == ".json":
        return pl.read_json(path)

    if ext == ".jsonl":
        return pl.read_ndjson(path, n_rows=n_rows)

    if ext == ".parquet":
        return pl.read_parquet(path, n_rows=n_rows)

    if ext in (".xlsx", ".xls"):
        return pl.read_excel(path, sheet_name=sheet_name or 0)

    raise ValueError(f"Unhandled extension: {ext}")


def load_from_db(
    connection_uri: str,
    query: str,
) -> pl.DataFrame:
    """Load data from a database using a SQL query.

    Args:
        connection_uri: SQLAlchemy connection URI.
        query: SQL query to execute.

    Returns:
        A Polars DataFrame with the query results.
    """
    from sqlalchemy import create_engine, text

    engine = create_engine(connection_uri)

    with engine.connect() as conn:
        result = conn.execute(text(query))
        columns = list(result.keys())
        rows = result.fetchall()

    if not rows:
        return pl.DataFrame(schema={col: pl.Utf8 for col in columns})

    data = {col: [row[i] for row in rows] for i, col in enumerate(columns)}
    return pl.DataFrame(data)


def get_db_tables(connection_uri: str) -> list[dict]:
    """List all tables in a database with row counts.

    Args:
        connection_uri: SQLAlchemy connection URI.

    Returns:
        List of dicts with table name, schema, and estimated row count.
    """
    from sqlalchemy import create_engine, inspect

    engine = create_engine(connection_uri)
    inspector = inspect(engine)

    tables = []
    for table_name in inspector.get_table_names():
        columns = inspector.get_columns(table_name)
        pk = inspector.get_pk_constraint(table_name)
        fks = inspector.get_foreign_keys(table_name)
        indexes = inspector.get_indexes(table_name)

        tables.append({
            "name": table_name,
            "columns": [
                {"name": col["name"], "type": str(col["type"])}
                for col in columns
            ],
            "primary_key": pk.get("constrained_columns", []),
            "foreign_keys": [
                {
                    "columns": fk["constrained_columns"],
                    "referred_table": fk["referred_table"],
                    "referred_columns": fk["referred_columns"],
                }
                for fk in fks
            ],
            "indexes": [
                {"name": idx["name"], "columns": idx["column_names"]}
                for idx in indexes
            ],
        })

    return tables
