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
try:
    import duckdb as _duckdb
except ImportError:
    _duckdb = None

from pureql.ingestion import load
from pureql.profiling import profile
from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, drop_columns, rename_column, filter_rows, auto_clean,
    fill_nulls_ml, deduplicate_semantic, export_pipeline,
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
    is_ollama_installed, is_ollama_running, get_installed_models, start_ollama,
)
from pureql.ai.interpreter import interpret, build_context
from pureql.ai.keychain import save_api_key, get_api_key, delete_api_key, has_api_key


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
        # Multi-dataset registry: name -> DataFrame
        self.datasets: dict = {}

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
            strategy = params.get("strategy", "mode")
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column")

            if strategy == "ml":
                cleaned, stats = fill_nulls_ml(
                    df,
                    column=column,
                    strategy=params.get("ml_strategy", "knn"),
                    n_neighbors=params.get("n_neighbors", 5),
                )
                state.df = cleaned
                prof = profile(state.df)
                version = state.store.commit(
                    df=state.df,
                    operation="fill_nulls_ml",
                    description=f"ML imputation ({params.get('ml_strategy', 'knn')}): {stats['rows_changed']} values predicted.",
                    quality_score=prof.quality_score,
                    rows_affected=stats["rows_changed"],
                )
                return {
                    "success": True,
                    "description": f"ML imputation: {stats['rows_changed']} values filled using {params.get('ml_strategy', 'knn').upper()}.",
                    "quality_score": prof.quality_score,
                    "rows_affected": stats["rows_changed"],
                    "version": {"id": version.id, "label": version.label},
                }
            else:
                result = fill_nulls(df, column=column, strategy=strategy)

        elif action_type == "deduplicate_semantic":
            cleaned, stats = deduplicate_semantic(
                df,
                subset=params.get("subset"),
                threshold=params.get("threshold", 0.92),
            )
            state.df = cleaned
            prof = profile(state.df)
            version = state.store.commit(
                df=state.df,
                operation="deduplicate_semantic",
                description=f"Semantic dedup: removed {stats['removed']} near-duplicate rows (threshold: {stats['threshold']}).",
                quality_score=prof.quality_score,
                rows_affected=stats["removed"],
            )
            return {
                "success": True,
                "description": f"Removed {stats['removed']} semantically duplicate rows.",
                "quality_score": prof.quality_score,
                "rows_affected": stats["removed"],
                "version": {"id": version.id, "label": version.label},
            }

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

        # ── Analytical / Query actions ─────────────────────────────────────────
        elif action_type in ("query", "group_by", "aggregate", "sort_by", "slice", "join", "merge"):
            # All analytical operations execute via DuckDB SQL
            sql = None

            if action_type == "query":
                sql = params.get("sql") or params.get("query")

            elif action_type in ("group_by", "aggregate"):
                # Build GROUP BY SQL from params
                by_col   = params.get("by") or params.get("group_by") or params.get("column", "")
                agg_fn   = params.get("function", "count")
                agg_col  = params.get("on") or params.get("column", "*")
                tbl      = params.get("table") or params.get("from") or "data"
                having   = params.get("having", "")

                if isinstance(by_col, list):
                    by_sql = ", ".join(f'"{c}"' for c in by_col)
                else:
                    by_sql = f'"{by_col}"'

                cols_select = params.get("columns", [])
                if cols_select:
                    extra = ", ".join(f'"{c}"' for c in cols_select)
                    select_clause = f'{by_sql}, {extra}, {agg_fn}({agg_col}) AS {agg_fn}_{agg_col}'
                else:
                    select_clause = f'{by_sql}, {agg_fn}({agg_col}) AS {agg_fn}_{agg_col}'

                sql = f'SELECT {select_clause} FROM "{tbl}" GROUP BY {by_sql}'
                if having:
                    sql += f' HAVING {having}'
                sql += f' ORDER BY {agg_fn}_{agg_col} DESC'

            elif action_type == "sort_by":
                col   = params.get("column", params.get("by", ""))
                order = params.get("order", params.get("direction", "desc")).upper()
                tbl   = params.get("table") or "data"
                limit = params.get("limit", "")
                sql   = f'SELECT * FROM "{tbl}" ORDER BY "{col}" {order}'
                if limit:
                    sql += f' LIMIT {int(limit)}'

            elif action_type == "slice":
                start = params.get("start", 0)
                stop  = params.get("stop", 100)
                tbl   = params.get("table") or "data"
                sql   = f'SELECT * FROM "{tbl}" LIMIT {stop - start} OFFSET {start}'

            elif action_type in ("join", "merge"):
                left  = params.get("left")  or params.get("table") or "data"
                right = params.get("right") or params.get("with")
                on    = params.get("on")    or params.get("key")
                how   = params.get("how",   params.get("type", "INNER")).upper()
                if right and on:
                    if isinstance(on, list):
                        on_sql = " AND ".join(f'"{left}"."{c}" = "{right}"."{c}"' for c in on)
                    else:
                        on_sql = f'"{left}"."{on}" = "{right}"."{on}"'
                    sql = f'SELECT * FROM "{left}" {how} JOIN "{right}" ON {on_sql}'
                else:
                    return {"success": False, "description": "join requires 'right' dataset and 'on' column(s)."}

            if not sql:
                return {"success": False, "description": f"Could not build SQL for action '{action_type}'. Params: {params}"}

            # ── Execute with DuckDB ──
            if _duckdb is None:
                return {"success": False, "description": "DuckDB not installed. Run: pip install duckdb"}

            con = _duckdb.connect()
            # Register all loaded datasets as DuckDB views
            for ds_name, ds_df in state.datasets.items():
                table_name = ds_name.replace(".csv", "").replace(".parquet", "").replace(".json", "").replace("-", "_").replace(" ", "_")
                # Register both with and without extension as table names
                con.register(table_name, ds_df.to_arrow())
                con.register(ds_name, ds_df.to_arrow())
            # Also register current df as "data" fallback
            if state.df is not None and "data" not in state.datasets:
                con.register("data", state.df.to_arrow())

            try:
                result_arrow = con.execute(sql).arrow()
                result_df = pl.from_arrow(result_arrow)
            except Exception as sql_err:
                con.close()
                return {"success": False, "description": f"Query error: {sql_err}\nSQL: {sql}"}
            finally:
                con.close()

            # Store result as new active dataframe
            state.df = result_df
            state.dataset_name = state.dataset_name or "query_result"
            prof2 = profile(state.df)

            row_count = len(result_df)
            col_count = len(result_df.columns)
            description = params.get("description", f"Query result: {row_count:,} rows × {col_count} cols")

            version = state.store.commit(
                df=state.df,
                operation="query",
                description=description,
                quality_score=prof2.quality_score,
                rows_affected=row_count,
                sql=sql,
                datasets_used=list(state.datasets.keys()),
            )

            return {
                "success": True,
                "description": description,
                "quality_score": prof2.quality_score,
                "rows_affected": row_count,
                "sql": sql,
                "version": {"id": version.id, "label": version.label},
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
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""

        path = self.path

        # /upload is handled separately — body is already fully read above
        if path == "/upload":
            try:
                self._handle_upload(raw_body)
            except Exception as e:
                self._respond(500, {"error": str(e), "traceback": traceback.format_exc()})
            return

        # All other endpoints expect JSON
        try:
            data = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return

        try:
            if path == "/load":
                self._handle_load(data)
            elif path == "/profile":
                self._handle_profile()
            elif path == "/chat":
                self._handle_chat(data)
            elif path == "/chat/stream":
                self._handle_chat_stream(data)
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
            elif path == "/ollama/start":
                self._handle_ollama_start()
            elif path == "/ollama/models":
                self._handle_ollama_models()
            elif path == "/settings":
                self._handle_settings(data)
            elif path == "/export":
                self._handle_export(data)
            elif path == "/export/download":
                self._handle_export_download(data)
            elif path == "/export/pipeline":
                self._handle_export_pipeline(data)
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
            elif path == "/datasets/list":
                self._handle_datasets_list()
            elif path == "/datasets/add":
                self._handle_datasets_add(data)
            elif path == "/datasets/preview":
                self._handle_datasets_preview(data)
            elif path == "/datasets/remove":
                self._handle_datasets_remove(data)
            elif path == "/versions/compare":
                self._handle_versions_compare(data)
            elif path == "/diff":
                self._handle_diff(data)
            elif path == "/apikey/save":
                self._handle_apikey_save(data)
            elif path == "/apikey/delete":
                self._handle_apikey_delete(data)
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
        elif self.path.startswith("/apikey/"):
            provider = self.path.split("/apikey/")[1].split("/")[0]
            self._respond(200, {"provider": provider, "hasKey": has_api_key(provider)})
        else:
            self._respond(404, {"error": "Not found"})

    # ── Handlers ──

    def _handle_upload(self, raw_body: bytes):
        """Receive a file as base64 JSON (body already read by do_POST) and load it."""
        import tempfile, base64 as _base64, os, json as _json

        content_type = self.headers.get("Content-Type", "")

        if "application/json" in content_type or True:
            # Body is always base64 JSON sent by the frontend uploadDataset()
            try:
                data = _json.loads(raw_body.decode("utf-8"))
            except Exception:
                self._respond(400, {"error": "Invalid JSON in upload body"})
                return
            filename   = data.get("filename", "dataset.csv")
            b64        = data.get("data", "")
            if not b64:
                self._respond(400, {"error": "Missing base64 data in upload"})
                return
            try:
                file_bytes = _base64.b64decode(b64)
            except Exception:
                self._respond(400, {"error": "Invalid base64 data"})
                return
        else:
            self._respond(400, {"error": "Unsupported Content-Type for upload"})
            return

        # Save to temp file and load
        suffix = Path(filename).suffix or ".csv"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="pureql_") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            state.reset()
            state.df = load(tmp_path)
            state.dataset_name = filename
            state.datasets[filename] = state.df  # register in multi-dataset registry
            prof = profile(state.df)
            state.store.create_initial(state.df, quality_score=prof.quality_score)
            self._respond(200, {
                "success": True,
                "datasetName": state.dataset_name,
                "profile": prof.to_dict(),
                "preview": _get_preview(state.df),
                "versions": state.store.get_timeline(),
            })
        except Exception as e:
            self._respond(400, {"error": str(e)})
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    def _handle_load(self, data: dict):
        file_path = data.get("path", "")
        if not file_path:
            self._respond(400, {"error": "Missing 'path'"})
            return

        state.reset()
        state.df = load(file_path)
        state.dataset_name = Path(file_path).name
        state.datasets[state.dataset_name] = state.df  # register in multi-dataset registry

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

    def _handle_chat_stream(self, data: dict):
        """
        Stream the AI response token-by-token using Server-Sent Events.

        Event types:
          data: {"type": "token",  "text": "..."}   — one or more tokens
          data: {"type": "done",   "explanation": "...", "actions": [...],
                                   "results": [...], "versions": [...],
                                   "preview": [...], "error": null}
          data: {"type": "error",  "message": "..."}
        """
        from pureql.ai.ollama_client import generate_stream, is_ollama_running, start_ollama as _start_ollama
        from pureql.ai.interpreter import build_context, _parse_response, SYSTEM_PROMPT
        from pureql.ai.cloud_providers import generate_cloud

        message = data.get("message", "")
        selected_datasets = data.get("datasets", [])  # list of dataset names for this query
        if not message:
            self._respond(400, {"error": "Missing 'message'"})
            return

        # Build context — support multi-dataset
        context_parts = []

        # If specific datasets selected, use those
        datasets_for_context = {}
        if selected_datasets:
            for name in selected_datasets:
                if name in state.datasets:
                    datasets_for_context[name] = state.datasets[name]
                elif name == state.dataset_name and state.df is not None:
                    datasets_for_context[name] = state.df
        elif state.df is not None:
            datasets_for_context[state.dataset_name] = state.df

        for ds_name, ds_df in datasets_for_context.items():
            prof = profile(ds_df)
            prof_dict = prof.to_dict()
            ds_context = build_context(
                columns=prof_dict["columns"],
                row_count=prof_dict["rowCount"],
                quality_score=prof_dict["qualityScore"],
                issues=prof_dict["issues"],
            )
            context_parts.append(f"DATASET '{ds_name}':\n{ds_context}")

        context = "\n\n".join(context_parts)

        # If multiple datasets, add join hint
        if len(datasets_for_context) > 1:
            names = list(datasets_for_context.keys())
            safe_names = [n.replace(".csv","").replace(".parquet","").replace("-","_").replace(" ","_") for n in names]
            context += f"\n\nAVAILABLE TABLES FOR SQL QUERIES:"
            for orig, safe in zip(names, safe_names):
                ds_df = datasets_for_context[orig]
                context += f"\n  - \"{orig}\" (also usable as: {safe}) — {len(ds_df)} rows, cols: {', '.join(ds_df.columns)}"
            context += f"\n\nFor JOIN queries use exact filenames in quotes, e.g.: FROM \"{names[0]}\" JOIN \"{names[1]}\" ON ..."
        elif len(datasets_for_context) == 1:
            name = list(datasets_for_context.keys())[0]
            safe = name.replace(".csv","").replace(".parquet","").replace("-","_").replace(" ","_")
            df_ctx = list(datasets_for_context.values())[0]
            context += f"\n\nTABLE NAME FOR SQL: \"{name}\" (or: {safe}) — {len(df_ctx)} rows"

        prompt_parts = []
        if context:
            prompt_parts.append(f"DATASET CONTEXT:\n{context}\n")
        prompt_parts.append(f"USER COMMAND: {message}")
        full_prompt = "\n".join(prompt_parts)

        # Send SSE headers
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

        def send_event(payload: dict):
            line = "data: " + json.dumps(payload, default=str) + "\n\n"
            self.wfile.write(line.encode("utf-8"))
            self.wfile.flush()

        try:
            full_text = []

            if state.ai_provider == "ollama":
                if not is_ollama_running():
                    send_event({"type": "token", "text": "Starting Ollama… "})
                    started = _start_ollama()
                    if not started:
                        send_event({"type": "error", "message": "Ollama is not running. Please start it with 'ollama serve' and try again."})
                        return
                    full_text = []
                # Verify model is installed — give a clear action if not
                installed = get_installed_models()
                installed_names = [m.get("name", "") for m in installed]
                model_found = any(
                    state.ai_model == n or state.ai_model.split(":")[0] == n.split(":")[0]
                    for n in installed_names
                )
                if not model_found and installed_names:
                    send_event({
                        "type": "error",
                        "message": (
                            f"Model '{state.ai_model}' is not installed. "
                            f"Run: ollama pull {state.ai_model}\n"
                            f"Installed models: {', '.join(installed_names)}"
                        )
                    })
                    return
                last_err = None
                for attempt in range(2):
                    try:
                        for chunk in generate_stream(
                            prompt=full_prompt,
                            model=state.ai_model,
                            system=SYSTEM_PROMPT,
                            temperature=0.1,
                        ):
                            full_text.append(chunk)
                            send_event({"type": "token", "text": chunk})
                        last_err = None
                        break
                    except ConnectionError as ce:
                        last_err = ce
                        err_str = str(ce).lower()
                        if ("timed out" in err_str or "timeout" in err_str) and attempt == 0:
                            import time as _time
                            send_event({"type": "token", "text": "\n⏳ Model is loading into memory, retrying in 5s…\n"})
                            _time.sleep(5)
                            full_text = []
                            continue
                        raise
                if last_err:
                    raise last_err
            else:
                # Cloud providers don't stream here — generate full then emit tokens word-by-word
                raw = generate_cloud(
                    prompt=full_prompt,
                    system=SYSTEM_PROMPT,
                    provider_name=state.ai_provider,
                    api_key=state.ai_api_key,
                    model=state.ai_model,
                    temperature=0.1,
                )
                for word in raw.split(" "):
                    chunk = word + " "
                    full_text.append(chunk)
                    send_event({"type": "token", "text": chunk})

            # Parse the full accumulated response
            raw_response = "".join(full_text)
            interpreted = _parse_response(raw_response)

            # Execute actions
            results = []
            for action in interpreted.actions:
                result = execute_action(action.type, action.params, action.target)
                results.append(result)

            # execute_action already commits versions for cleaning + query actions.
            # Only do a fallback commit for actions that succeeded but don't self-commit.
            if state.df is not None:
                prof2 = profile(state.df)
                for r in results:
                    already_committed = r.get("version") is not None
                    if r.get("success") and not already_committed and r.get("rows_affected", 0) > 0:
                        state.store.commit(
                            df=state.df,
                            operation=r.get("operation", "transform"),
                            description=r.get("description", "AI operation"),
                            quality_score=prof2.quality_score,
                            rows_affected=r.get("rows_affected", 0),
                            sql=next((r2.get("sql") for r2 in results if r2.get("sql")), None),
                            datasets_used=list(datasets_for_context.keys()),
                        )

            # Fresh profile after all actions ran
            final_prof = profile(state.df).to_dict() if state.df is not None else None

            send_event({
                "type": "done",
                "explanation": interpreted.explanation,
                "confidence": interpreted.confidence,
                "actions": [{"type": a.type, "params": a.params, "target": a.target} for a in interpreted.actions],
                "results": results,
                "preview": _get_preview(state.df) if state.df is not None else [],
                "profile": final_prof,
                "versions": state.store.get_timeline(),
                "error": interpreted.error,
            })

        except Exception as e:
            send_event({"type": "error", "message": str(e)})

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

    def _handle_ollama_start(self):
        """Try to start the Ollama server if installed but not running."""
        if not is_ollama_installed():
            self._respond(200, {
                "started": False,
                "running": False,
                "error": "Ollama is not installed. Download it from https://ollama.com",
            })
            return

        if is_ollama_running():
            self._respond(200, {
                "started": False,   # already was running, no action needed
                "running": True,
                "message": "Ollama was already running.",
            })
            return

        # Not running — try to start it
        ok = start_ollama()
        if ok:
            self._respond(200, {
                "started": True,
                "running": True,
                "message": "Ollama server started successfully.",
            })
        else:
            self._respond(200, {
                "started": False,
                "running": False,
                "error": (
                    "Ollama is installed but could not be started automatically. "
                    "Please run 'ollama serve' in a terminal and try again."
                ),
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
        if "apiKey" in data and data["apiKey"]:
            # Persist to OS keychain and keep in memory
            save_api_key(state.ai_provider, data["apiKey"])
            state.ai_api_key = data["apiKey"]
        elif state.ai_api_key is None and state.ai_provider != "ollama":
            # Try to load from keychain on first use
            state.ai_api_key = get_api_key(state.ai_provider)

        self._respond(200, {
            "model": state.ai_model,
            "provider": state.ai_provider,
            "hasApiKey": has_api_key(state.ai_provider) or state.ai_api_key is not None,
        })

    def _handle_export(self, data: dict):
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return
        fmt = data.get("format", "csv")
        path = data.get("path", f"export.{fmt}")

        if fmt == "py":
            try:
                script = export_pipeline(
                    versions=state.store.get_timeline(),
                    source_path=data.get("sourcePath") or state.dataset_name,
                    output_path=path,
                    table_name=data.get("tableName") or "data",
                )
                self._respond(200, {"success": True, "path": path, "format": fmt})
            except Exception as e:
                self._respond(500, {"success": False, "error": str(e)})
            return

        _export_data(state.df, fmt, path, data.get("tableName"))
        self._respond(200, {"success": True, "path": path, "format": fmt})

    def _handle_export_download(self, data: dict):
        """Export to in-memory buffer and return as base64 for browser download."""
        import base64, tempfile, os
        if state.df is None:
            self._respond(400, {"error": "No dataset loaded"})
            return

        fmt        = data.get("format", "csv")
        filename   = data.get("filename", f"export.{fmt}")
        table_name = data.get("tableName") or "data"

        try:
            if fmt == "csv":
                buf = state.df.write_csv()
                raw = buf.encode("utf-8") if isinstance(buf, str) else buf
            elif fmt == "json":
                buf = state.df.write_json()
                raw = buf.encode("utf-8") if isinstance(buf, str) else buf
            elif fmt == "parquet":
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
                tmp.close()
                state.df.write_parquet(tmp.name)
                with open(tmp.name, "rb") as f_:
                    raw = f_.read()
                os.unlink(tmp.name)
            elif fmt == "xlsx":
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
                tmp.close()
                state.df.write_excel(tmp.name)
                with open(tmp.name, "rb") as f_:
                    raw = f_.read()
                os.unlink(tmp.name)
            elif fmt == "sql":
                schema = generate_schema(state.df, table_name=table_name)
                lines = [schema.query + "\n"]
                for row in state.df.iter_rows(named=True):
                    cols = ", ".join(f'"{k}"' for k in row.keys())
                    vals = ", ".join(_sql_value(v) for v in row.values())
                    lines.append(f"INSERT INTO {table_name} ({cols}) VALUES ({vals});\n")
                raw = "".join(lines).encode("utf-8")
            elif fmt == "py":
                script = export_pipeline(
                    versions=state.store.get_timeline(),
                    source_path=state.dataset_name or "dataset.csv",
                    output_path=f"{table_name}_clean.csv",
                    table_name=table_name,
                )
                raw = script.encode("utf-8") if isinstance(script, str) else script
            else:
                self._respond(400, {"error": f"Unknown format: {fmt}"})
                return

            self._respond(200, {
                "success": True,
                "filename": filename,
                "format": fmt,
                "data": base64.b64encode(raw).decode("ascii"),
                "size": len(raw),
            })
        except Exception as e:
            self._respond(500, {"error": str(e)})


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

    def _handle_diff(self, data: dict):
        """Return a diff summary between two versions."""
        version_a = data.get("versionA", "")
        version_b = data.get("versionB", "")
        if not version_a or not version_b:
            self._respond(400, {"error": "Missing versionA or versionB"})
            return
        diff = state.store.diff(version_a, version_b)
        self._respond(200, diff)

    def _handle_export_pipeline(self, data: dict):
        """Export the full session as a reproducible Python pipeline script."""
        path = data.get("path", "pipeline.py")
        table_name = data.get("tableName", "data")
        source_path = data.get("sourcePath") or state.dataset_name

        try:
            script = export_pipeline(
                versions=state.store.get_timeline(),
                source_path=source_path,
                output_path=path,
                table_name=table_name,
            )
            self._respond(200, {"success": True, "path": path, "script": script[:500] + "..."})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    def _handle_apikey_save(self, data: dict):
        """Save an API key to the OS keychain."""
        provider = data.get("provider", "")
        api_key = data.get("apiKey", "")
        if not provider or not api_key:
            self._respond(400, {"error": "Missing 'provider' or 'apiKey'"})
            return
        save_api_key(provider, api_key)
        # Store in session state for immediate use
        state.ai_api_key = api_key
        self._respond(200, {"success": True, "provider": provider})

    def _handle_apikey_delete(self, data: dict):
        """Delete an API key from the OS keychain."""
        provider = data.get("provider", "")
        if not provider:
            self._respond(400, {"error": "Missing 'provider'"})
            return
        delete_api_key(provider)
        self._respond(200, {"success": True, "provider": provider})

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

    # ── Multi-Dataset Endpoints ──

    def _handle_datasets_list(self):
        """List all registered datasets with mini-profiles."""
        result = []
        for name, df in state.datasets.items():
            try:
                prof = profile(df)
                result.append({
                    "name": name,
                    "rowCount": prof.row_count,
                    "colCount": prof.col_count,
                    "qualityScore": prof.quality_score,
                    "columns": [c["name"] for c in prof.to_dict()["columns"][:8]],
                    "preview": df.head(5).to_dicts(),
                    "isActive": name == state.dataset_name,
                })
            except Exception as e:
                result.append({"name": name, "error": str(e)})
        self._respond(200, {"datasets": result})

    def _handle_datasets_add(self, data: dict):
        """Add a dataset to the registry without resetting the active dataset."""
        import tempfile, base64 as _base64, os
        filename = data.get("filename", "dataset.csv")
        b64 = data.get("data", "")
        if not b64:
            self._respond(400, {"error": "Missing base64 data"})
            return
        try:
            file_bytes = _base64.b64decode(b64)
        except Exception:
            self._respond(400, {"error": "Invalid base64 data"})
            return

        suffix = Path(filename).suffix or ".csv"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="pureql_") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            df = load(tmp_path)
            # Use unique name if already exists
            name = filename
            if name in state.datasets and name != state.dataset_name:
                base = Path(filename).stem
                ext = Path(filename).suffix
                i = 2
                while name in state.datasets:
                    name = f"{base}_{i}{ext}"
                    i += 1
            state.datasets[name] = df

            prof = profile(df)
            self._respond(200, {
                "success": True,
                "name": name,
                "rowCount": prof.row_count,
                "colCount": prof.col_count,
                "qualityScore": prof.quality_score,
                "columns": [c["name"] for c in prof.to_dict()["columns"][:8]],
                "preview": df.head(10).to_dicts(),
            })
        except Exception as e:
            self._respond(400, {"error": str(e)})
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    def _handle_datasets_preview(self, data: dict):
        """Get preview rows for a specific dataset."""
        name = data.get("name", "")
        rows = data.get("rows", 50)
        df = state.datasets.get(name)
        if df is None:
            self._respond(404, {"error": f"Dataset '{name}' not found"})
            return
        prof = profile(df)
        self._respond(200, {
            "name": name,
            "preview": df.head(rows).to_dicts(),
            "profile": prof.to_dict(),
        })

    def _handle_datasets_remove(self, data: dict):
        """Remove a dataset from the registry."""
        name = data.get("name", "")
        if name in state.datasets:
            del state.datasets[name]
            self._respond(200, {"success": True, "removed": name})
        else:
            self._respond(404, {"error": f"Dataset '{name}' not found"})

    def _handle_versions_compare(self, data: dict):
        """Compare two versions side-by-side."""
        v1_id = data.get("v1Id")
        v2_id = data.get("v2Id")
        if not v1_id or not v2_id:
            self._respond(400, {"error": "Missing v1Id or v2Id"})
            return

        df1 = state.store.get_version(v1_id)
        df2 = state.store.get_version(v2_id)
        v1_meta = next((v for v in state.store.versions if v.id == v1_id), None)
        v2_meta = next((v for v in state.store.versions if v.id == v2_id), None)

        if df1 is None or df2 is None:
            self._respond(404, {"error": "One or both versions not found"})
            return

        # Compute diff stats
        added_rows = max(0, df2.height - df1.height)
        removed_rows = max(0, df1.height - df2.height)

        # Column diff
        cols1 = set(df1.columns)
        cols2 = set(df2.columns)
        added_cols = list(cols2 - cols1)
        removed_cols = list(cols1 - cols2)
        common_cols = list(cols1 & cols2)

        self._respond(200, {
            "v1": {
                "id": v1_id,
                "label": v1_meta.label if v1_meta else v1_id,
                "description": v1_meta.description if v1_meta else "",
                "rowCount": df1.height,
                "colCount": df1.width,
                "qualityScore": v1_meta.quality_score if v1_meta else 0,
                "sql": v1_meta.sql if v1_meta else None,
                "preview": df1.head(50).to_dicts(),
            },
            "v2": {
                "id": v2_id,
                "label": v2_meta.label if v2_meta else v2_id,
                "description": v2_meta.description if v2_meta else "",
                "rowCount": df2.height,
                "colCount": df2.width,
                "qualityScore": v2_meta.quality_score if v2_meta else 0,
                "sql": v2_meta.sql if v2_meta else None,
                "preview": df2.head(50).to_dicts(),
            },
            "diff": {
                "addedRows": added_rows,
                "removedRows": removed_rows,
                "addedColumns": added_cols,
                "removedColumns": removed_cols,
                "commonColumns": common_cols,
            },
        })

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