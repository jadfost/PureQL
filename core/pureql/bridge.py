"""PureQL Bridge Server — HTTP API that connects Tauri frontend to Python core.

This runs as a local HTTP server on a random port. Tauri launches it
as a sidecar process and communicates via localhost.
"""

from __future__ import annotations

import json
import sys
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional
from pathlib import Path

import polars as pl

from pureql.ingestion import load
from pureql.profiling import profile
from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, drop_columns, rename_column, filter_rows, auto_clean,
)
from pureql.sql import generate_schema, optimize_query, run_query
from pureql.versioning import VersionStore
from pureql.database import (
    build_uri, connect as db_connect, test_connection, disconnect as db_disconnect,
    get_tables, read_table, read_query, write_table,
    ConnectionStore, SUPPORTED_ENGINES,
)
from pureql.ai.ollama_client import (
    detect_hardware, get_recommended_models,
    is_ollama_installed, is_ollama_running, get_installed_models,
)
from pureql.ai.interpreter import interpret, build_context


# ── Global State ──

class AppState:
    """Holds the current session state."""

    def __init__(self):
        self.df: Optional[pl.DataFrame] = None
        self.store: VersionStore = VersionStore()
        self.dataset_name: str = ""
        self.ai_model: str = "qwen2.5:7b"
        self.ai_provider: str = "ollama"
        self.ai_api_key: Optional[str] = None
        self.connections: ConnectionStore = ConnectionStore()

    def reset(self):
        self.df = None
        self.store = VersionStore()
        self.dataset_name = ""


state = AppState()


# ── Action Executor ──

def execute_action(action_type: str, params: dict, target: str) -> dict:
    """Execute a single action from the interpreter on the current DataFrame.

    Returns a dict with: success, description, quality_score, rows_affected.
    """
    if state.df is None:
        return {"success": False, "description": "No dataset loaded."}

    df = state.df

    try:
        if action_type == "deduplicate":
            result = deduplicate(
                df,
                strategy=params.get("strategy", "exact"),
                subset=params.get("subset"),
                threshold=params.get("threshold", 0.85),
            )

        elif action_type == "standardize":
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column", "")
            result = standardize(df, column, method=params.get("method", "cluster_merge"))

        elif action_type == "fix_formats":
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column")
            result = fix_formats(df, column=column, format_type=params.get("format_type", "auto"))

        elif action_type == "fill_nulls":
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column")
            result = fill_nulls(df, column=column, strategy=params.get("strategy", "mode"))

        elif action_type == "remove_outliers":
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column", "")
            result = remove_outliers(
                df, column,
                method=params.get("method", "iqr"),
                threshold=params.get("threshold", 1.5),
            )

        elif action_type == "drop_columns":
            result = drop_columns(df, params.get("columns", []))

        elif action_type == "rename_column":
            result = rename_column(df, params.get("from", ""), params.get("to", ""))

        elif action_type == "filter_rows":
            result = filter_rows(df, params.get("condition", ""))

        elif action_type == "generate_sql":
            schema_result = generate_schema(
                df,
                table_name=params.get("table_name", "data"),
                engine=params.get("engine", "postgresql"),
            )
            return {
                "success": True,
                "description": schema_result.explanation,
                "sql": schema_result.query,
                "indexes": schema_result.suggested_indexes,
                "rows_affected": 0,
            }

        elif action_type == "optimize_sql":
            opt_result = optimize_query(
                params.get("query", ""),
                engine=params.get("engine", "postgresql"),
            )
            return {
                "success": True,
                "description": opt_result.explanation,
                "sql": opt_result.query,
                "original_sql": opt_result.original_query,
                "changes": opt_result.changes,
                "indexes": opt_result.suggested_indexes,
                "rows_affected": 0,
            }

        elif action_type == "profile":
            prof = profile(df)
            return {
                "success": True,
                "description": f"Quality score: {prof.quality_score}/100. {len(prof.issues)} issues found.",
                "profile": prof.to_dict(),
                "rows_affected": 0,
            }

        elif action_type == "export":
            fmt = params.get("format", "csv")
            path = params.get("path", f"export.{fmt}")
            _export_data(df, fmt, path, params.get("table_name"))
            return {
                "success": True,
                "description": f"Exported to {path} ({fmt}).",
                "rows_affected": 0,
            }

        else:
            return {"success": False, "description": f"Unknown action: {action_type}"}

        # Apply the result
        state.df = result.df
        prof = profile(state.df)

        # Commit version
        version = state.store.commit(
            df=state.df,
            operation=action_type,
            description=result.description,
            quality_score=prof.quality_score,
            rows_affected=result.rows_affected,
        )

        return {
            "success": True,
            "description": result.description,
            "quality_score": prof.quality_score,
            "rows_affected": result.rows_affected,
            "version": {"id": version.id, "label": version.label},
        }

    except Exception as e:
        return {"success": False, "description": f"Error: {str(e)}"}


def _export_data(df: pl.DataFrame, fmt: str, path: str, table_name: Optional[str] = None):
    """Export DataFrame to the specified format."""
    p = Path(path)
    if fmt == "csv":
        df.write_csv(p)
    elif fmt == "parquet":
        df.write_parquet(p)
    elif fmt == "json":
        df.write_json(p)
    elif fmt == "xlsx":
        df.write_excel(p)
    elif fmt == "sql":
        schema = generate_schema(df, table_name=table_name or "data")
        with open(p, "w") as f:
            f.write(schema.query + "\n\n")
            # Write INSERT statements
            for row in df.iter_rows(named=True):
                cols = ", ".join(f'"{k}"' for k in row.keys())
                vals = ", ".join(_sql_value(v) for v in row.values())
                f.write(f"INSERT INTO {table_name or 'data'} ({cols}) VALUES ({vals});\n")


def _sql_value(v) -> str:
    """Convert a Python value to SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, str):
        return f"'{v.replace(chr(39), chr(39)+chr(39))}'"
    return str(v)


# ── HTTP Handler ──

class PureQLHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the PureQL bridge server."""

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return

        path = self.path

        try:
            if path == "/load":
                self._handle_load(data)
            elif path == "/profile":
                self._handle_profile()
            elif path == "/chat":
                self._handle_chat(data)
            elif path == "/execute":
                self._handle_execute(data)
            elif path == "/preview":
                self._handle_preview(data)
            elif path == "/versions":
                self._handle_versions()
            elif path == "/undo":
                self._handle_undo()
            elif path == "/redo":
                self._handle_redo()
            elif path == "/checkout":
                self._handle_checkout(data)
            elif path == "/hardware":
                self._handle_hardware()
            elif path == "/ollama/status":
                self._handle_ollama_status()
            elif path == "/ollama/models":
                self._handle_ollama_models()
            elif path == "/settings":
                self._handle_settings(data)
            elif path == "/export":
                self._handle_export(data)
            elif path == "/auto-clean":
                self._handle_auto_clean()
            elif path == "/schema":
                self._handle_schema(data)
            elif path == "/optimize":
                self._handle_optimize(data)
            elif path == "/query":
                self._handle_query(data)
            elif path == "/db/engines":
                self._handle_db_engines()
            elif path == "/db/connect":
                self._handle_db_connect(data)
            elif path == "/db/test":
                self._handle_db_test(data)
            elif path == "/db/disconnect":
                self._handle_db_disconnect(data)
            elif path == "/db/tables":
                self._handle_db_tables(data)
            elif path == "/db/read":
                self._handle_db_read(data)
            elif path == "/db/read-query":
                self._handle_db_read_query(data)
            elif path == "/db/write":
                self._handle_db_write(data)
            elif path == "/db/connections":
                self._handle_db_connections()
            else:
                self._respond(404, {"error": f"Unknown endpoint: {path}"})
        except Exception as e:
            self._respond(500, {"error": str(e), "traceback": traceback.format_exc()})

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok", "version": "0.1.0"})
        elif self.path == "/state":
            self._respond(200, {
                "hasDataset": state.df is not None,
                "datasetName": state.dataset_name,
                "versionCount": state.store.version_count,
                "currentVersion": state.store.current_label,
                "aiModel": state.ai_model,
                "aiProvider": state.ai_provider,
            })
        else:
            self._respond(404, {"error": "Not found"})

    # ── Handlers ──

    def _handle_load(self, data: dict):
        file_path = data.get("path", "")
        if not file_path:
            self._respond(400, {"error": "Missing 'path'"})
            return

        state.reset()
        state.df = load(file_path)
        state.dataset_name = Path(file_path).name

        prof = profile(state.df)
        state.store.create_initial(state.df, quality_score=prof.quality_score)

        self._respond(200, {
            "success": True,
            "datasetName": state.dataset_name,
            "profile": prof.to_dict(),
            "preview": _get_preview(state.df),
            "versions": state.store.get_timeline(),
        })

    def _handle_profile(self):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        prof = profile(state.df)
        self._respond(200, {"profile": prof.to_dict()})

    def _handle_chat(self, data: dict):
        message = data.get("message", "")
        if not message:
            self._respond(400, {"error": "Missing 'message'"})
            return

        # Build context from current data
        context = ""
        if state.df is not None:
            prof = profile(state.df)
            prof_dict = prof.to_dict()
            context = build_context(
                columns=prof_dict["columns"],
                row_count=prof_dict["rowCount"],
                quality_score=prof_dict["qualityScore"],
                issues=prof_dict["issues"],
            )

        # Interpret the message
        interpreted = interpret(
            user_message=message,
            context=context,
            model=state.ai_model,
            provider=state.ai_provider,
            api_key=state.ai_api_key,
        )

        # Execute actions
        results = []
        for action in interpreted.actions:
            result = execute_action(action.type, action.params, action.target)
            results.append(result)

        self._respond(200, {
            "explanation": interpreted.explanation,
            "confidence": interpreted.confidence,
            "actions": [{"type": a.type, "params": a.params, "target": a.target} for a in interpreted.actions],
            "results": results,
            "preview": _get_preview(state.df) if state.df is not None else [],
            "versions": state.store.get_timeline(),
            "error": interpreted.error,
        })

    def _handle_execute(self, data: dict):
        action_type = data.get("type", "")
        params = data.get("params", {})
        target = data.get("target", "all")

        result = execute_action(action_type, params, target)

        response = {**result}
        if state.df is not None:
            response["preview"] = _get_preview(state.df)
        response["versions"] = state.store.get_timeline()

        self._respond(200, response)

    def _handle_preview(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        n = data.get("rows", 100)
        self._respond(200, {"preview": _get_preview(state.df, n)})

    def _handle_versions(self):
        self._respond(200, {
            "versions": state.store.get_timeline(),
            "currentId": state.store.current_id,
        })

    def _handle_undo(self):
        result = state.store.undo()
        if result is not None:
            state.df = result
            self._respond(200, {
                "success": True,
                "preview": _get_preview(state.df),
                "versions": state.store.get_timeline(),
                "currentId": state.store.current_id,
            })
        else:
            self._respond(200, {"success": False, "message": "Already at first version."})

    def _handle_redo(self):
        result = state.store.redo()
        if result is not None:
            state.df = result
            self._respond(200, {
                "success": True,
                "preview": _get_preview(state.df),
                "versions": state.store.get_timeline(),
                "currentId": state.store.current_id,
            })
        else:
            self._respond(200, {"success": False, "message": "Already at latest version."})

    def _handle_checkout(self, data: dict):
        version_id = data.get("versionId", "")
        result = state.store.checkout(version_id)
        if result is not None:
            state.df = result
            self._respond(200, {
                "success": True,
                "preview": _get_preview(state.df),
                "versions": state.store.get_timeline(),
                "currentId": state.store.current_id,
            })
        else:
            self._respond(400, {"error": "Version not found"})

    def _handle_hardware(self):
        hw = detect_hardware()
        models = get_recommended_models(hw)
        self._respond(200, {
            "hardware": {
                "ramGb": hw.ram_gb,
                "cpuCores": hw.cpu_cores,
                "gpu": hw.gpu,
                "os": hw.os,
                "arch": hw.arch,
                "tier": hw.tier,
            },
            "recommendedModels": models,
        })

    def _handle_ollama_status(self):
        self._respond(200, {
            "installed": is_ollama_installed(),
            "running": is_ollama_running(),
            "models": get_installed_models() if is_ollama_running() else [],
        })

    def _handle_ollama_models(self):
        if is_ollama_running():
            self._respond(200, {"models": get_installed_models()})
        else:
            self._respond(200, {"models": [], "warning": "Ollama is not running"})

    def _handle_settings(self, data: dict):
        if "model" in data:
            state.ai_model = data["model"]
        if "provider" in data:
            state.ai_provider = data["provider"]
        if "apiKey" in data:
            state.ai_api_key = data["apiKey"]

        self._respond(200, {
            "model": state.ai_model,
            "provider": state.ai_provider,
            "hasApiKey": state.ai_api_key is not None,
        })

    def _handle_export(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        fmt = data.get("format", "csv")
        path = data.get("path", f"export.{fmt}")
        _export_data(state.df, fmt, path, data.get("tableName"))
        self._respond(200, {"success": True, "path": path, "format": fmt})

    def _handle_auto_clean(self):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return

        cleaned, results = auto_clean(state.df)
        state.df = cleaned
        prof = profile(state.df)

        for r in results:
            state.store.commit(
                df=state.df,
                operation=r.operation,
                description=r.description,
                quality_score=prof.quality_score,
                rows_affected=r.rows_affected,
            )

        self._respond(200, {
            "success": True,
            "operations": [
                {"operation": r.operation, "description": r.description, "rowsAffected": r.rows_affected}
                for r in results
            ],
            "qualityScore": prof.quality_score,
            "preview": _get_preview(state.df),
            "versions": state.store.get_timeline(),
        })

    def _handle_schema(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        result = generate_schema(
            state.df,
            table_name=data.get("tableName", "data"),
            engine=data.get("engine", "postgresql"),
        )
        self._respond(200, {
            "sql": result.query,
            "indexes": result.suggested_indexes,
            "explanation": result.explanation,
        })

    def _handle_optimize(self, data: dict):
        query = data.get("query", "")
        result = optimize_query(query, engine=data.get("engine", "postgresql"))
        self._respond(200, {
            "sql": result.query,
            "originalSql": result.original_query,
            "changes": result.changes,
            "indexes": result.suggested_indexes,
            "explanation": result.explanation,
        })

    def _handle_query(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        query = data.get("query", "")
        table_name = data.get("tableName", "data")
        try:
            result = run_query(state.df, query, table_name)
            self._respond(200, {
                "success": True,
                "preview": _get_preview(result),
                "rowCount": result.height,
                "colCount": result.width,
            })
        except Exception as e:
            self._respond(400, {"error": str(e)})

    # ── Database Handlers ──

    def _handle_db_engines(self):
        engines = [
            {
                "id": k,
                "name": v["name"],
                "icon": v["icon"],
                "defaultPort": v["default_port"],
            }
            for k, v in SUPPORTED_ENGINES.items()
        ]
        self._respond(200, {"engines": engines})

    def _handle_db_connect(self, data: dict):
        engine_type = data.get("engineType", "postgresql")
        name = data.get("name", engine_type)

        # Build URI from params or use direct URI
        uri = data.get("uri")
        if not uri:
            uri = build_uri(
                engine_type=engine_type,
                host=data.get("host", "localhost"),
                port=data.get("port"),
                database=data.get("database", ""),
                user=data.get("user", ""),
                password=data.get("password", ""),
                path=data.get("path", ""),
            )

        conn = db_connect(uri=uri, name=name, engine_type=engine_type)
        state.connections.add(conn)

        if conn.connected:
            tables = get_tables(conn)
            self._respond(200, {
                "success": True,
                "connection": conn.to_dict(),
                "tables": [t.to_dict() for t in tables],
            })
        else:
            self._respond(200, {
                "success": False,
                "connection": conn.to_dict(),
                "error": conn.error,
            })

    def _handle_db_test(self, data: dict):
        engine_type = data.get("engineType", "postgresql")

        uri = data.get("uri")
        if not uri:
            uri = build_uri(
                engine_type=engine_type,
                host=data.get("host", "localhost"),
                port=data.get("port"),
                database=data.get("database", ""),
                user=data.get("user", ""),
                password=data.get("password", ""),
                path=data.get("path", ""),
            )

        result = test_connection(uri)
        self._respond(200, result)

    def _handle_db_disconnect(self, data: dict):
        name = data.get("name", "")
        state.connections.remove(name)
        self._respond(200, {"success": True, "message": f"Disconnected from '{name}'."})

    def _handle_db_tables(self, data: dict):
        name = data.get("connection", "")
        schema = data.get("schema")
        conn = state.connections.get(name)

        if not conn or not conn.connected:
            self._respond(400, {"error": f"Connection '{name}' not found or not connected."})
            return

        tables = get_tables(conn, schema=schema)
        self._respond(200, {"tables": [t.to_dict() for t in tables]})

    def _handle_db_read(self, data: dict):
        name = data.get("connection", "")
        conn = state.connections.get(name)

        if not conn or not conn.connected:
            self._respond(400, {"error": f"Connection '{name}' not found."})
            return

        table_name = data.get("table", "")
        columns = data.get("columns")
        limit = data.get("limit")
        where = data.get("where")

        df = read_table(conn, table_name, columns=columns, limit=limit, where=where)

        # Set as current dataset
        state.df = df
        state.dataset_name = f"{name}:{table_name}"

        prof = profile(state.df)
        state.store = VersionStore()
        state.store.create_initial(state.df, quality_score=prof.quality_score)

        self._respond(200, {
            "success": True,
            "datasetName": state.dataset_name,
            "profile": prof.to_dict(),
            "preview": _get_preview(state.df),
            "versions": state.store.get_timeline(),
        })

    def _handle_db_read_query(self, data: dict):
        name = data.get("connection", "")
        conn = state.connections.get(name)

        if not conn or not conn.connected:
            self._respond(400, {"error": f"Connection '{name}' not found."})
            return

        query = data.get("query", "")
        df = read_query(conn, query)

        state.df = df
        state.dataset_name = f"{name}:query"

        prof = profile(state.df)
        state.store = VersionStore()
        state.store.create_initial(state.df, quality_score=prof.quality_score)

        self._respond(200, {
            "success": True,
            "datasetName": state.dataset_name,
            "profile": prof.to_dict(),
            "preview": _get_preview(state.df),
            "versions": state.store.get_timeline(),
            "rowCount": df.height,
            "colCount": df.width,
        })

    def _handle_db_write(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded."})
            return

        name = data.get("connection", "")
        conn = state.connections.get(name)

        if not conn or not conn.connected:
            self._respond(400, {"error": f"Connection '{name}' not found."})
            return

        table_name = data.get("table", "export")
        if_exists = data.get("ifExists", "replace")

        result = write_table(conn, state.df, table_name, if_exists=if_exists)
        self._respond(200, result)

    def _handle_db_connections(self):
        self._respond(200, {
            "connections": state.connections.list_connections(),
        })

    # ── Response Helper ──

    def _respond(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode("utf-8"))

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging, print to stderr for Tauri to capture."""
        print(f"[PureQL] {args[0]}", file=sys.stderr)


def _get_preview(df: Optional[pl.DataFrame], n: int = 100) -> list[dict]:
    """Get preview rows as list of dicts for JSON serialization."""
    if df is None:
        return []
    return df.head(n).to_dicts()


# ── Main ──

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9741

    server = HTTPServer(("127.0.0.1", port), PureQLHandler)
    print(f"PUREQL_READY:{port}", flush=True)  # Signal to Tauri that we're ready
    print(f"[PureQL] Bridge server running on http://127.0.0.1:{port}", file=sys.stderr)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[PureQL] Shutting down...", file=sys.stderr)
        server.shutdown()


if __name__ == "__main__":
    main()
