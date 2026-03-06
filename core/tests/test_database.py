"""Tests for PureQL Database module — uses SQLite for testing (no external DB needed)."""

import tempfile
from pathlib import Path

import polars as pl
import pytest

from pureql.database import (
    build_uri, connect, test_connection, disconnect,
    get_tables, read_table, read_query, write_table,
    ConnectionStore, SUPPORTED_ENGINES, DatabaseConnection, TableInfo,
)


@pytest.fixture
def sqlite_db(tmp_path) -> Path:
    """Create a test SQLite database with sample data."""
    db_path = tmp_path / "test.db"

    import sqlite3
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT,
            city TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER,
            amount REAL,
            date TEXT,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    """)
    cursor.execute("""
        CREATE INDEX idx_orders_customer ON orders(customer_id)
    """)

    customers = [
        (1, "Alice", "alice@mail.com", "Bogota"),
        (2, "Bob", "bob@mail.com", "Medellin"),
        (3, "Charlie", "charlie@mail.com", "Cali"),
        (4, "Diana", None, "Bogota"),
        (5, "Eve", "eve@mail.com", "Medellin"),
    ]
    cursor.executemany("INSERT INTO customers VALUES (?, ?, ?, ?)", customers)

    orders = [
        (1, 1, 150.00, "2024-01-15"),
        (2, 1, 250.00, "2024-02-20"),
        (3, 2, 100.00, "2024-01-10"),
        (4, 3, 300.00, "2024-03-05"),
        (5, 4, 50.00, "2024-01-25"),
        (6, 5, 200.00, "2024-02-15"),
        (7, 2, 175.00, "2024-03-10"),
    ]
    cursor.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", orders)

    conn.commit()
    conn.close()
    return db_path


@pytest.fixture
def db_conn(sqlite_db) -> DatabaseConnection:
    """Create a connected database connection."""
    uri = f"sqlite:///{sqlite_db}"
    conn = connect(uri=uri, name="test_db", engine_type="sqlite")
    yield conn
    disconnect(conn)


class TestBuildUri:
    def test_postgresql_uri(self):
        uri = build_uri("postgresql", host="localhost", port=5432, database="mydb", user="admin", password="pass123")
        assert "postgresql://" in uri
        assert "admin" in uri
        assert "localhost" in uri
        assert "mydb" in uri

    def test_mysql_uri(self):
        uri = build_uri("mysql", host="db.example.com", database="app", user="root", password="secret")
        assert "mysql+pymysql://" in uri
        assert "3306" in uri  # default port

    def test_sqlite_uri(self):
        uri = build_uri("sqlite", path="/tmp/test.db")
        assert "sqlite:////tmp/test.db" in uri

    def test_password_special_chars(self):
        uri = build_uri("postgresql", user="admin", password="p@ss#word!", database="db")
        # Special chars should be URL-encoded
        assert "p%40ss%23word%21" in uri

    def test_unsupported_engine(self):
        with pytest.raises(ValueError, match="Unsupported"):
            build_uri("mongodb")

    def test_default_port(self):
        uri = build_uri("postgresql", user="u", password="p", database="db")
        assert "5432" in uri


class TestConnection:
    def test_connect_sqlite(self, sqlite_db):
        uri = f"sqlite:///{sqlite_db}"
        conn = connect(uri=uri, name="test", engine_type="sqlite")

        assert conn.connected is True
        assert conn.error is None
        assert conn.name == "test"
        disconnect(conn)

    def test_connect_invalid(self):
        conn = connect(uri="sqlite:///nonexistent/path/db.sqlite", name="bad", engine_type="sqlite")
        # SQLite creates file on connect, so this might actually work
        # Test with a clearly invalid URI instead
        conn2 = connect(uri="postgresql://bad:bad@nonexistent:5432/nope", name="bad", engine_type="postgresql")
        assert conn2.connected is False
        assert conn2.error is not None

    def test_test_connection_success(self, sqlite_db):
        uri = f"sqlite:///{sqlite_db}"
        result = test_connection(uri)
        assert result["success"] is True

    def test_test_connection_failure(self):
        result = test_connection("postgresql://bad:bad@nonexistent:5432/nope")
        assert result["success"] is False
        assert "error" in result

    def test_disconnect(self, sqlite_db):
        uri = f"sqlite:///{sqlite_db}"
        conn = connect(uri=uri, name="test", engine_type="sqlite")
        assert conn.connected is True

        disconnect(conn)
        assert conn.connected is False

    def test_to_dict(self, db_conn):
        d = db_conn.to_dict()
        assert "name" in d
        assert "engineType" in d
        assert d["connected"] is True


class TestGetTables:
    def test_list_tables(self, db_conn):
        tables = get_tables(db_conn)
        table_names = [t.name for t in tables]

        assert "customers" in table_names
        assert "orders" in table_names

    def test_table_has_columns(self, db_conn):
        tables = get_tables(db_conn)
        customers = next(t for t in tables if t.name == "customers")

        col_names = [c["name"] for c in customers.columns]
        assert "id" in col_names
        assert "name" in col_names
        assert "email" in col_names
        assert "city" in col_names

    def test_table_has_row_count(self, db_conn):
        tables = get_tables(db_conn)
        customers = next(t for t in tables if t.name == "customers")

        assert customers.row_count == 5

    def test_table_has_indexes(self, db_conn):
        tables = get_tables(db_conn)
        orders = next(t for t in tables if t.name == "orders")

        index_names = [i["name"] for i in orders.indexes]
        assert "idx_orders_customer" in index_names

    def test_table_to_dict(self, db_conn):
        tables = get_tables(db_conn)
        d = tables[0].to_dict()

        assert "name" in d
        assert "columns" in d
        assert "rowCount" in d


class TestReadData:
    def test_read_table(self, db_conn):
        df = read_table(db_conn, "customers")
        assert isinstance(df, pl.DataFrame)
        assert df.height == 5
        assert "name" in df.columns

    def test_read_table_with_columns(self, db_conn):
        df = read_table(db_conn, "customers", columns=["name", "city"])
        assert df.width == 2
        assert "name" in df.columns
        assert "city" in df.columns

    def test_read_table_with_limit(self, db_conn):
        df = read_table(db_conn, "customers", limit=3)
        assert df.height == 3

    def test_read_table_with_where(self, db_conn):
        df = read_table(db_conn, "customers", where="city = 'Bogota'")
        assert df.height == 2  # Alice and Diana

    def test_read_query(self, db_conn):
        df = read_query(db_conn, """
            SELECT c.name, SUM(o.amount) as total
            FROM customers c
            JOIN orders o ON c.id = o.customer_id
            GROUP BY c.name
            ORDER BY total DESC
        """)
        assert isinstance(df, pl.DataFrame)
        assert "name" in df.columns
        assert "total" in df.columns
        assert df.height > 0

    def test_read_empty_result(self, db_conn):
        df = read_query(db_conn, "SELECT * FROM customers WHERE city = 'NonexistentCity'")
        assert df.height == 0


class TestWriteData:
    def test_write_new_table(self, db_conn):
        df = pl.DataFrame({
            "product": ["Laptop", "Mouse", "Keyboard"],
            "price": [2500.0, 50.0, 120.0],
        })
        result = write_table(db_conn, df, "products", if_exists="replace")
        assert result["success"] is True
        assert result["rows"] == 3

        # Verify it was written
        read_back = read_table(db_conn, "products")
        assert read_back.height == 3

    def test_write_append(self, db_conn):
        df = pl.DataFrame({
            "id": [10],
            "name": ["Frank"],
            "email": ["frank@mail.com"],
            "city": ["Cartagena"],
        })
        result = write_table(db_conn, df, "customers", if_exists="append")
        assert result["success"] is True

        # Verify it was appended
        all_customers = read_table(db_conn, "customers")
        assert all_customers.height == 6  # 5 original + 1 new

    def test_write_replace(self, db_conn):
        df = pl.DataFrame({"x": [1, 2, 3]})
        write_table(db_conn, df, "temp_table", if_exists="replace")

        df2 = pl.DataFrame({"x": [10, 20]})
        write_table(db_conn, df2, "temp_table", if_exists="replace")

        result = read_table(db_conn, "temp_table")
        assert result.height == 2  # replaced, not appended


class TestConnectionStore:
    def test_add_and_get(self, sqlite_db):
        store = ConnectionStore()
        uri = f"sqlite:///{sqlite_db}"
        conn = connect(uri=uri, name="my_db", engine_type="sqlite")
        store.add(conn)

        retrieved = store.get("my_db")
        assert retrieved is not None
        assert retrieved.name == "my_db"

        store.disconnect_all()

    def test_list_connections(self, sqlite_db):
        store = ConnectionStore()
        uri = f"sqlite:///{sqlite_db}"
        conn = connect(uri=uri, name="db1", engine_type="sqlite")
        store.add(conn)

        connections = store.list_connections()
        assert len(connections) == 1
        assert connections[0]["name"] == "db1"

        store.disconnect_all()

    def test_remove(self, sqlite_db):
        store = ConnectionStore()
        uri = f"sqlite:///{sqlite_db}"
        conn = connect(uri=uri, name="to_remove", engine_type="sqlite")
        store.add(conn)

        store.remove("to_remove")
        assert store.count == 0

    def test_disconnect_all(self, sqlite_db):
        store = ConnectionStore()
        uri = f"sqlite:///{sqlite_db}"
        for name in ["db1", "db2"]:
            conn = connect(uri=uri, name=name, engine_type="sqlite")
            store.add(conn)

        assert store.count == 2
        store.disconnect_all()
        assert store.count == 0


class TestSupportedEngines:
    def test_all_engines_have_required_fields(self):
        for engine_id, info in SUPPORTED_ENGINES.items():
            assert "name" in info, f"Missing 'name' in {engine_id}"
            assert "icon" in info, f"Missing 'icon' in {engine_id}"
            assert "uri_template" in info, f"Missing 'uri_template' in {engine_id}"

    def test_expected_engines_present(self):
        assert "postgresql" in SUPPORTED_ENGINES
        assert "mysql" in SUPPORTED_ENGINES
        assert "sqlite" in SUPPORTED_ENGINES
        assert "mssql" in SUPPORTED_ENGINES
