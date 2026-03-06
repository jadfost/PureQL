"""Database connection module — connect, explore, read, and write to any database.

Supports PostgreSQL, MySQL, SQLite, SQL Server, MariaDB, Oracle, DuckDB
via SQLAlchemy. Credentials are never stored in plain text.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path

import polars as pl


@dataclass
class DatabaseConnection:
    """Represents an active database connection."""
    name: str
    engine_type: str  # postgresql, mysql, sqlite, etc.
    uri: str
    connected: bool = False
    error: Optional[str] = None
    _engine: object = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "engineType": self.engine_type,
            "connected": self.connected,
            "error": self.error,
        }


@dataclass
class TableInfo:
    """Information about a database table."""
    name: str
    schema: Optional[str]
    columns: list[dict]
    primary_key: list[str]
    foreign_keys: list[dict]
    indexes: list[dict]
    row_count: Optional[int] = None
    is_view: bool = False

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "schema": self.schema,
            "columns": self.columns,
            "primaryKey": self.primary_key,
            "foreignKeys": self.foreign_keys,
            "indexes": self.indexes,
            "rowCount": self.row_count,
            "isView": self.is_view,
        }


# ── Supported Engines ──

SUPPORTED_ENGINES = {
    "postgresql": {
        "name": "PostgreSQL",
        "icon": "🐘",
        "default_port": 5432,
        "uri_template": "postgresql://{user}:{password}@{host}:{port}/{database}",
        "driver": "psycopg2",
    },
    "mysql": {
        "name": "MySQL",
        "icon": "🐬",
        "default_port": 3306,
        "uri_template": "mysql+pymysql://{user}:{password}@{host}:{port}/{database}",
        "driver": "pymysql",
    },
    "sqlite": {
        "name": "SQLite",
        "icon": "📦",
        "default_port": None,
        "uri_template": "sqlite:///{path}",
        "driver": None,
    },
    "mssql": {
        "name": "SQL Server",
        "icon": "🟦",
        "default_port": 1433,
        "uri_template": "mssql+pyodbc://{user}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server",
        "driver": "pyodbc",
    },
    "mariadb": {
        "name": "MariaDB",
        "icon": "🦭",
        "default_port": 3306,
        "uri_template": "mariadb+pymysql://{user}:{password}@{host}:{port}/{database}",
        "driver": "pymysql",
    },
    "duckdb": {
        "name": "DuckDB",
        "icon": "🦆",
        "default_port": None,
        "uri_template": "duckdb:///{path}",
        "driver": None,
    },
}


# ── Connection Management ──


def build_uri(
    engine_type: str,
    host: str = "localhost",
    port: Optional[int] = None,
    database: str = "",
    user: str = "",
    password: str = "",
    path: str = "",
) -> str:
    """Build a SQLAlchemy connection URI from parameters.

    Args:
        engine_type: One of the SUPPORTED_ENGINES keys.
        host: Database host.
        port: Database port (uses default if None).
        database: Database name.
        user: Username.
        password: Password.
        path: File path (for SQLite/DuckDB).

    Returns:
        A SQLAlchemy connection URI string.
    """
    if engine_type not in SUPPORTED_ENGINES:
        raise ValueError(f"Unsupported engine: {engine_type}. Supported: {list(SUPPORTED_ENGINES.keys())}")

    engine_info = SUPPORTED_ENGINES[engine_type]

    if engine_type in ("sqlite", "duckdb"):
        return engine_info["uri_template"].format(path=path)

    actual_port = port or engine_info["default_port"]

    # URL-encode password for special characters
    from urllib.parse import quote_plus
    safe_password = quote_plus(password) if password else ""

    return engine_info["uri_template"].format(
        user=user,
        password=safe_password,
        host=host,
        port=actual_port,
        database=database,
    )


def connect(
    uri: str,
    name: str = "default",
    engine_type: str = "postgresql",
) -> DatabaseConnection:
    """Create a database connection.

    Args:
        uri: SQLAlchemy connection URI.
        name: Human-readable name for this connection.
        engine_type: Type of database engine.

    Returns:
        A DatabaseConnection object.
    """
    from sqlalchemy import create_engine, text

    conn = DatabaseConnection(name=name, engine_type=engine_type, uri=uri)

    try:
        engine = create_engine(uri, pool_pre_ping=True, pool_size=5)

        # Test the connection
        with engine.connect() as c:
            c.execute(text("SELECT 1"))

        conn._engine = engine
        conn.connected = True
    except Exception as e:
        conn.connected = False
        conn.error = str(e)

    return conn


def check_connection(uri: str) -> dict:
    """Test if a connection URI is valid.

    Returns:
        Dict with "success" and "message" or "error".
    """
    from sqlalchemy import create_engine, text

    try:
        engine = create_engine(uri, pool_pre_ping=True)
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        engine.dispose()
        return {"success": True, "message": "Connection successful!"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def disconnect(conn: DatabaseConnection):
    """Close a database connection."""
    if conn._engine is not None:
        try:
            conn._engine.dispose()
        except Exception:
            pass
    conn._engine = None
    conn.connected = False


# ── Schema Exploration ──


def get_tables(conn: DatabaseConnection, schema: Optional[str] = None) -> list[TableInfo]:
    """List all tables and views in a database.

    Args:
        conn: An active DatabaseConnection.
        schema: Optional schema name to filter by.

    Returns:
        List of TableInfo objects with column details.
    """
    if not conn.connected or conn._engine is None:
        raise ConnectionError("Not connected to database.")

    from sqlalchemy import inspect, text

    inspector = inspect(conn._engine)
    tables = []

    # Get tables
    for table_name in inspector.get_table_names(schema=schema):
        info = _get_table_info(inspector, table_name, schema, is_view=False)

        # Try to get row count
        try:
            with conn._engine.connect() as c:
                qualified = f'"{schema}"."{table_name}"' if schema else f'"{table_name}"'
                result = c.execute(text(f"SELECT COUNT(*) FROM {qualified}"))
                info.row_count = result.scalar()
        except Exception:
            info.row_count = None

        tables.append(info)

    # Get views
    try:
        for view_name in inspector.get_view_names(schema=schema):
            info = _get_table_info(inspector, view_name, schema, is_view=True)
            tables.append(info)
    except Exception:
        pass  # Some engines don't support view introspection

    return tables


def _get_table_info(inspector, table_name: str, schema: Optional[str], is_view: bool) -> TableInfo:
    """Extract detailed info about a single table."""
    columns = []
    for col in inspector.get_columns(table_name, schema=schema):
        columns.append({
            "name": col["name"],
            "type": str(col["type"]),
            "nullable": col.get("nullable", True),
            "default": str(col.get("default", "")) if col.get("default") else None,
        })

    pk = inspector.get_pk_constraint(table_name, schema=schema)
    pk_columns = pk.get("constrained_columns", []) if pk else []

    fks = []
    try:
        for fk in inspector.get_foreign_keys(table_name, schema=schema):
            fks.append({
                "columns": fk.get("constrained_columns", []),
                "referredTable": fk.get("referred_table", ""),
                "referredColumns": fk.get("referred_columns", []),
            })
    except Exception:
        pass

    indexes = []
    try:
        for idx in inspector.get_indexes(table_name, schema=schema):
            indexes.append({
                "name": idx.get("name", ""),
                "columns": idx.get("column_names", []),
                "unique": idx.get("unique", False),
            })
    except Exception:
        pass

    return TableInfo(
        name=table_name,
        schema=schema,
        columns=columns,
        primary_key=pk_columns,
        foreign_keys=fks,
        indexes=indexes,
        is_view=is_view,
    )


# ── Data Reading ──


def read_table(
    conn: DatabaseConnection,
    table_name: str,
    schema: Optional[str] = None,
    columns: Optional[list[str]] = None,
    limit: Optional[int] = None,
    where: Optional[str] = None,
) -> pl.DataFrame:
    """Read data from a table into a Polars DataFrame.

    Args:
        conn: Active database connection.
        table_name: Name of the table to read.
        schema: Optional schema name.
        columns: Specific columns to select (None = all).
        limit: Maximum rows to read (None = all).
        where: Optional WHERE clause (without the WHERE keyword).

    Returns:
        A Polars DataFrame with the data.
    """
    if not conn.connected or conn._engine is None:
        raise ConnectionError("Not connected to database.")

    col_str = ", ".join(f'"{c}"' for c in columns) if columns else "*"
    qualified = f'"{schema}"."{table_name}"' if schema else f'"{table_name}"'

    query = f"SELECT {col_str} FROM {qualified}"
    if where:
        query += f" WHERE {where}"
    if limit:
        query += f" LIMIT {limit}"

    return read_query(conn, query)


def read_query(conn: DatabaseConnection, query: str) -> pl.DataFrame:
    """Execute a SQL query and return results as a Polars DataFrame.

    Args:
        conn: Active database connection.
        query: SQL query to execute.

    Returns:
        A Polars DataFrame with the query results.
    """
    if not conn.connected or conn._engine is None:
        raise ConnectionError("Not connected to database.")

    from sqlalchemy import text

    with conn._engine.connect() as c:
        result = c.execute(text(query))
        columns = list(result.keys())
        rows = result.fetchall()

    if not rows:
        return pl.DataFrame(schema={col: pl.Utf8 for col in columns})

    data = {col: [row[i] for row in rows] for i, col in enumerate(columns)}
    return pl.DataFrame(data)


def read_multiple_tables(
    conn: DatabaseConnection,
    table_names: list[str],
    schema: Optional[str] = None,
    limit: Optional[int] = None,
) -> dict[str, pl.DataFrame]:
    """Read multiple tables at once.

    Returns:
        Dict mapping table name to DataFrame.
    """
    result = {}
    for name in table_names:
        result[name] = read_table(conn, name, schema=schema, limit=limit)
    return result


# ── Data Writing ──


def write_table(
    conn: DatabaseConnection,
    df: pl.DataFrame,
    table_name: str,
    schema: Optional[str] = None,
    if_exists: str = "replace",
) -> dict:
    """Write a DataFrame to a database table.

    Args:
        conn: Active database connection.
        df: DataFrame to write.
        table_name: Target table name.
        schema: Optional schema name.
        if_exists: "replace" (drop+create), "append" (insert into existing), "fail" (error if exists).

    Returns:
        Dict with success status and row count.
    """
    if not conn.connected or conn._engine is None:
        raise ConnectionError("Not connected to database.")

    # Convert Polars to pandas for SQLAlchemy write compatibility
    pdf = df.to_pandas()

    try:
        pdf.to_sql(
            name=table_name,
            con=conn._engine,
            schema=schema,
            if_exists=if_exists,
            index=False,
        )
        return {
            "success": True,
            "table": table_name,
            "rows": len(df),
            "message": f"Wrote {len(df):,} rows to '{table_name}'.",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


# ── Connection Store (manages multiple connections) ──


class ConnectionStore:
    """Manages multiple database connections."""

    def __init__(self):
        self._connections: dict[str, DatabaseConnection] = {}

    def add(self, conn: DatabaseConnection) -> str:
        """Add a connection to the store. Returns the connection name."""
        self._connections[conn.name] = conn
        return conn.name

    def get(self, name: str) -> Optional[DatabaseConnection]:
        """Get a connection by name."""
        return self._connections.get(name)

    def remove(self, name: str):
        """Disconnect and remove a connection."""
        conn = self._connections.pop(name, None)
        if conn:
            disconnect(conn)

    def list_connections(self) -> list[dict]:
        """List all connections with their status."""
        return [c.to_dict() for c in self._connections.values()]

    def disconnect_all(self):
        """Disconnect all connections."""
        for conn in self._connections.values():
            disconnect(conn)
        self._connections.clear()

    @property
    def count(self) -> int:
        return len(self._connections)
