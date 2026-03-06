"""SQL module — query optimization, schema generation, and index suggestions."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import polars as pl
import sqlglot
from sqlglot import exp
from sqlglot.optimizer import optimize


@dataclass
class SQLResult:
    """Result of a SQL operation."""
    query: str
    original_query: Optional[str] = None
    changes: list[str] = field(default_factory=list)
    suggested_indexes: list[str] = field(default_factory=list)
    explanation: str = ""


# ── Schema Generation ──


def generate_schema(
    df: pl.DataFrame,
    table_name: str = "data",
    engine: str = "postgresql",
) -> SQLResult:
    """Generate an optimized CREATE TABLE statement from a DataFrame.

    Args:
        df: The DataFrame to generate schema from.
        table_name: Name for the SQL table.
        engine: Target database engine.

    Returns:
        SQLResult with CREATE TABLE statement and index suggestions.
    """
    type_map = _get_type_map(engine)
    columns_sql = []
    indexes = []

    for col_name in df.columns:
        col = df[col_name]
        sql_type = _polars_to_sql_type(col.dtype, type_map)
        nullable = col.null_count() > 0

        col_def = f"    {_quote_identifier(col_name, engine)} {sql_type}"
        if not nullable:
            col_def += " NOT NULL"

        columns_sql.append(col_def)

        # Suggest indexes for columns likely used in WHERE/JOIN
        if "id" in col_name.lower():
            indexes.append(
                f"CREATE INDEX idx_{table_name}_{col_name} ON {table_name} ({_quote_identifier(col_name, engine)});"
            )
        elif col.dtype in (pl.Date, pl.Datetime):
            indexes.append(
                f"CREATE INDEX idx_{table_name}_{col_name} ON {table_name} ({_quote_identifier(col_name, engine)});"
            )
        elif col.dtype == pl.Utf8 and col.n_unique() < df.height * 0.1:
            # Low cardinality string = good for indexing
            indexes.append(
                f"CREATE INDEX idx_{table_name}_{col_name} ON {table_name} ({_quote_identifier(col_name, engine)});"
            )

    create_sql = f"CREATE TABLE {table_name} (\n"
    create_sql += ",\n".join(columns_sql)
    create_sql += "\n);"

    return SQLResult(
        query=create_sql,
        suggested_indexes=indexes,
        explanation=f"Generated schema for '{table_name}' with {len(df.columns)} columns and {len(indexes)} suggested indexes.",
    )


def _get_type_map(engine: str) -> dict:
    """Get type mapping for the target engine."""
    base = {
        pl.Int8: "SMALLINT",
        pl.Int16: "SMALLINT",
        pl.Int32: "INTEGER",
        pl.Int64: "BIGINT",
        pl.Float32: "REAL",
        pl.Float64: "DOUBLE PRECISION",
        pl.Utf8: "VARCHAR(255)",
        pl.Boolean: "BOOLEAN",
        pl.Date: "DATE",
        pl.Datetime: "TIMESTAMP",
        pl.Time: "TIME",
        pl.Duration: "INTERVAL",
    }

    if engine == "mysql":
        base[pl.Float64] = "DOUBLE"
        base[pl.Utf8] = "VARCHAR(255)"
        base[pl.Boolean] = "TINYINT(1)"
    elif engine == "sqlite":
        base[pl.Int8] = "INTEGER"
        base[pl.Int16] = "INTEGER"
        base[pl.Int32] = "INTEGER"
        base[pl.Int64] = "INTEGER"
        base[pl.Float32] = "REAL"
        base[pl.Float64] = "REAL"
        base[pl.Utf8] = "TEXT"
        base[pl.Date] = "TEXT"
        base[pl.Datetime] = "TEXT"

    return base


def _polars_to_sql_type(dtype, type_map: dict) -> str:
    """Convert a Polars dtype to SQL type string."""
    return type_map.get(dtype, "TEXT")


def _quote_identifier(name: str, engine: str) -> str:
    """Quote a column/table name appropriately."""
    if engine == "mysql":
        return f"`{name}`"
    return f'"{name}"'


# ── Query Optimization ──


def optimize_query(
    query: str,
    engine: str = "postgresql",
    schema: Optional[dict] = None,
) -> SQLResult:
    """Optimize a SQL query using AST rewriting.

    Args:
        query: The SQL query to optimize.
        engine: Target database engine.
        schema: Optional schema dict for sqlglot optimizer.

    Returns:
        SQLResult with optimized query and list of changes.
    """
    changes = []
    dialect = _engine_to_dialect(engine)

    try:
        # Parse the query
        parsed = sqlglot.parse_one(query, dialect=dialect)
    except sqlglot.errors.ParseError as e:
        return SQLResult(
            query=query,
            original_query=query,
            explanation=f"Could not parse query: {e}",
        )

    optimized = parsed

    # Optimization 1: Replace SELECT * with explicit columns if schema is available
    if schema:
        try:
            optimized = optimize(optimized, schema=schema, dialect=dialect)
            changes.append("Applied sqlglot optimizer (predicate pushdown, projection pruning)")
        except Exception:
            pass  # If optimizer fails, continue with other optimizations

    # Optimization 2: Detect subqueries that could be JOINs
    original_sql = parsed.sql(dialect=dialect)
    optimized_sql = optimized.sql(dialect=dialect, pretty=True)

    if original_sql != optimized_sql:
        changes.append("Query rewritten for better performance")

    # Optimization 3: Suggest indexes based on WHERE/JOIN columns
    suggested_indexes = _extract_index_suggestions(parsed, engine)

    # Optimization 4: Check for common anti-patterns
    anti_patterns = _detect_anti_patterns(parsed)
    changes.extend(anti_patterns)

    return SQLResult(
        query=optimized_sql,
        original_query=query,
        changes=changes,
        suggested_indexes=suggested_indexes,
        explanation=f"Applied {len(changes)} optimizations. {len(suggested_indexes)} index suggestions.",
    )


def _engine_to_dialect(engine: str) -> str:
    """Convert engine name to sqlglot dialect."""
    mapping = {
        "postgresql": "postgres",
        "mysql": "mysql",
        "sqlite": "sqlite",
        "mssql": "tsql",
        "oracle": "oracle",
    }
    return mapping.get(engine, "postgres")


def _extract_index_suggestions(parsed, engine: str) -> list[str]:
    """Analyze query AST to suggest helpful indexes."""
    suggestions = []
    tables_seen = set()

    # Find columns used in WHERE clauses
    for where in parsed.find_all(exp.Where):
        for column in where.find_all(exp.Column):
            table = column.table or "table"
            col_name = column.name
            key = f"{table}.{col_name}"
            if key not in tables_seen:
                tables_seen.add(key)
                suggestions.append(
                    f"CREATE INDEX idx_{table}_{col_name} ON {table} ({_quote_identifier(col_name, engine)});"
                )

    # Find columns used in JOIN conditions
    for join in parsed.find_all(exp.Join):
        on_clause = join.find(exp.EQ)
        if on_clause:
            for column in on_clause.find_all(exp.Column):
                table = column.table or "table"
                col_name = column.name
                key = f"{table}.{col_name}"
                if key not in tables_seen:
                    tables_seen.add(key)
                    suggestions.append(
                        f"CREATE INDEX idx_{table}_{col_name} ON {table} ({_quote_identifier(col_name, engine)});"
                    )

    # Find columns used in ORDER BY
    for order in parsed.find_all(exp.Order):
        for column in order.find_all(exp.Column):
            table = column.table or "table"
            col_name = column.name
            key = f"{table}.{col_name}"
            if key not in tables_seen:
                tables_seen.add(key)
                suggestions.append(
                    f"-- Consider index for ORDER BY: {_quote_identifier(col_name, engine)}"
                )

    return suggestions


def _detect_anti_patterns(parsed) -> list[str]:
    """Detect common SQL anti-patterns."""
    warnings = []

    # Check for SELECT *
    for select in parsed.find_all(exp.Select):
        for star in select.find_all(exp.Star):
            warnings.append("Warning: SELECT * found. Consider specifying explicit columns for better performance.")
            break

    # Check for functions in WHERE (prevents index usage)
    for where in parsed.find_all(exp.Where):
        for func in where.find_all(exp.Func):
            # Check if function wraps a column
            for col in func.find_all(exp.Column):
                warnings.append(
                    f"Warning: Function on column '{col.name}' in WHERE clause may prevent index usage."
                )

    # Check for LIKE with leading wildcard
    for like in parsed.find_all(exp.Like):
        pattern = like.expression
        if isinstance(pattern, exp.Literal) and str(pattern.this).startswith("%"):
            warnings.append("Warning: LIKE with leading wildcard '%...' prevents index usage.")

    return warnings


# ── Query Generation via DuckDB ──


def run_query(df: pl.DataFrame, query: str, table_name: str = "data") -> pl.DataFrame:
    """Run a SQL query against a DataFrame using DuckDB.

    Args:
        df: The DataFrame to query.
        query: SQL query (use table_name to reference the data).
        table_name: How the DataFrame is referenced in the query.

    Returns:
        Result as a Polars DataFrame.
    """
    import duckdb

    # Register DataFrame with the specified table name
    conn = duckdb.connect()
    conn.register(table_name, df)
    result = conn.sql(query).pl()
    conn.close()

    return result
