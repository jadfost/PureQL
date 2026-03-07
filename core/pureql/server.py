"""PureQL FastAPI Server — Pro/Enterprise REST API.

Exposes the full PureQL engine as an HTTP API for integration
with Airflow, Prefect, or custom pipelines.

Usage:
    uvicorn pureql.server:app --host 127.0.0.1 --port 9742

Endpoints mirror the bridge server but with proper REST semantics,
request validation, and OpenAPI docs at /docs.
"""

from __future__ import annotations

from typing import Any, Optional

import polars as pl

try:
    from fastapi import FastAPI, HTTPException, Body
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False


from pureql.ingestion import load
from pureql.profiling import profile
from pureql.cleaning import (
    deduplicate, standardize, fix_formats, fill_nulls,
    remove_outliers, drop_columns, rename_column, filter_rows, auto_clean,
)
from pureql.sql import generate_schema, optimize_query, run_query
from pureql.versioning import VersionStore
from pureql.database import (
    build_uri, connect as db_connect, test_connection,
    get_tables, read_table, read_query as db_read_query,
    write_table, ConnectionStore, SUPPORTED_ENGINES,
)
from pureql.ai.interpreter import interpret, build_context
from pureql.ai.keychain import get_api_key, save_api_key, delete_api_key, has_api_key


def _require_fastapi():
    if not FASTAPI_AVAILABLE:
        raise ImportError(
            "FastAPI is required for the Pro server. "
            "Install it with: pip install fastapi uvicorn"
        )


# ── Application State ──

class ServerState:
    def __init__(self):
        self.df: Optional[pl.DataFrame] = None
        self.store: VersionStore = VersionStore()
        self.dataset_name: str = ""
        self.ai_model: str = "qwen2.5:7b"
        self.ai_provider: str = "ollama"
        self.connections: ConnectionStore = ConnectionStore()

    def reset(self):
        self.df = None
        self.store = VersionStore()
        self.dataset_name = ""


_state = ServerState()


# ── Pydantic Models ──

class LoadRequest(BaseModel):
    path: str = Field(..., description="Absolute path to CSV, JSON, Parquet, or Excel file")

class ChatRequest(BaseModel):
    message: str = Field(..., description="Natural language command")

class ExecuteRequest(BaseModel):
    type: str = Field(..., description="Action type (deduplicate, standardize, etc.)")
    params: dict[str, Any] = Field(default_factory=dict)
    target: str = Field(default="all")

class PreviewRequest(BaseModel):
    rows: int = Field(default=100, ge=1, le=10000)

class CheckoutRequest(BaseModel):
    version_id: str

class SchemaRequest(BaseModel):
    table_name: str = Field(default="data")
    engine: str = Field(default="postgresql")

class OptimizeRequest(BaseModel):
    query: str
    engine: str = Field(default="postgresql")

class QueryRequest(BaseModel):
    query: str
    table_name: str = Field(default="data")

class ExportRequest(BaseModel):
    format: str = Field(default="csv", description="csv, parquet, json, xlsx, sql, py")
    path: str
    table_name: Optional[str] = None

class SettingsRequest(BaseModel):
    model: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None

class ApiKeyRequest(BaseModel):
    provider: str
    api_key: str

class DbConnectRequest(BaseModel):
    engine_type: str = Field(default="postgresql")
    name: Optional[str] = None
    host: str = Field(default="localhost")
    port: Optional[int] = None
    database: str = Field(default="")
    user: str = Field(default="")
    password: str = Field(default="")
    path: str = Field(default="")
    uri: Optional[str] = None

class DbReadRequest(BaseModel):
    connection: str
    table: str
    columns: Optional[list[str]] = None
    limit: Optional[int] = None
    where: Optional[str] = None

class DbWriteRequest(BaseModel):
    connection: str
    table: str
    if_exists: str = Field(default="replace")


# ── App Factory ──

def create_app() -> "FastAPI":
    """Create and configure the FastAPI application."""
    _require_fastapi()

    app = FastAPI(
        title="PureQL API",
        description="Data cleaning + SQL optimization engine. Pro/Enterprise tier.",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health ──

    @app.get("/health", tags=["System"])
    def health():
        return {"status": "ok", "version": "0.1.0", "tier": "pro"}

    @app.get("/state", tags=["System"])
    def get_state():
        return {
            "hasDataset": _state.df is not None,
            "datasetName": _state.dataset_name,
            "versionCount": _state.store.version_count,
            "currentVersion": _state.store.current_label,
            "aiModel": _state.ai_model,
            "aiProvider": _state.ai_provider,
        }

    # ── Dataset ──

    @app.post("/load", tags=["Dataset"])
    def load_dataset(req: LoadRequest):
        """Load a data file and run initial profiling."""
        _state.reset()
        try:
            _state.df = load(req.path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

        from pathlib import Path
        _state.dataset_name = Path(req.path).name
        prof = profile(_state.df)
        _state.store.create_initial(_state.df, quality_score=prof.quality_score)

        return {
            "success": True,
            "datasetName": _state.dataset_name,
            "profile": prof.to_dict(),
            "preview": _state.df.head(100).to_dicts(),
            "versions": _state.store.get_timeline(),
        }

    @app.post("/preview", tags=["Dataset"])
    def get_preview(req: PreviewRequest):
        """Get preview rows from the current dataset."""
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")
        return {"preview": _state.df.head(req.rows).to_dicts()}

    @app.post("/profile", tags=["Dataset"])
    def get_profile():
        """Get the quality profile of the current dataset."""
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")
        return {"profile": profile(_state.df).to_dict()}

    # ── Chat ──

    @app.post("/chat", tags=["AI"])
    def chat(req: ChatRequest):
        """Send a natural language command and execute it."""
        context = ""
        if _state.df is not None:
            prof = profile(_state.df).to_dict()
            context = build_context(
                columns=prof["columns"],
                row_count=prof["rowCount"],
                quality_score=prof["qualityScore"],
                issues=prof["issues"],
            )

        api_key = get_api_key(_state.ai_provider) if _state.ai_provider != "ollama" else None

        interpreted = interpret(
            user_message=req.message,
            context=context,
            model=_state.ai_model,
            provider=_state.ai_provider,
            api_key=api_key,
        )

        results = []
        for action in interpreted.actions:
            result = _execute_action(action.type, action.params, action.target)
            results.append(result)

        return {
            "explanation": interpreted.explanation,
            "confidence": interpreted.confidence,
            "actions": [{"type": a.type, "params": a.params, "target": a.target}
                        for a in interpreted.actions],
            "results": results,
            "preview": _state.df.head(100).to_dicts() if _state.df is not None else [],
            "versions": _state.store.get_timeline(),
            "error": interpreted.error,
        }

    # ── Execute ──

    @app.post("/execute", tags=["Actions"])
    def execute(req: ExecuteRequest):
        """Execute a specific cleaning or SQL action."""
        result = _execute_action(req.type, req.params, req.target)
        response = {**result}
        if _state.df is not None:
            response["preview"] = _state.df.head(100).to_dicts()
        response["versions"] = _state.store.get_timeline()
        return response

    @app.post("/auto-clean", tags=["Actions"])
    def auto_clean_endpoint():
        """Automatically clean the dataset with sensible defaults."""
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")

        cleaned, results = auto_clean(_state.df)
        _state.df = cleaned
        prof = profile(_state.df)

        for r in results:
            _state.store.commit(
                df=_state.df,
                operation=r.operation,
                description=r.description,
                quality_score=prof.quality_score,
                rows_affected=r.rows_affected,
            )

        return {
            "success": True,
            "operations": [
                {"operation": r.operation, "description": r.description, "rowsAffected": r.rows_affected}
                for r in results
            ],
            "qualityScore": prof.quality_score,
            "preview": _state.df.head(100).to_dicts(),
            "versions": _state.store.get_timeline(),
        }

    # ── Versions ──

    @app.get("/versions", tags=["Versions"])
    def get_versions():
        return {"versions": _state.store.get_timeline(), "currentId": _state.store.current_id}

    @app.post("/undo", tags=["Versions"])
    def undo():
        result = _state.store.undo()
        if result is not None:
            _state.df = result
            return {
                "success": True,
                "preview": _state.df.head(100).to_dicts(),
                "versions": _state.store.get_timeline(),
                "currentId": _state.store.current_id,
            }
        return {"success": False, "message": "Already at first version."}

    @app.post("/redo", tags=["Versions"])
    def redo():
        result = _state.store.redo()
        if result is not None:
            _state.df = result
            return {
                "success": True,
                "preview": _state.df.head(100).to_dicts(),
                "versions": _state.store.get_timeline(),
                "currentId": _state.store.current_id,
            }
        return {"success": False, "message": "Already at latest version."}

    @app.post("/checkout", tags=["Versions"])
    def checkout(req: CheckoutRequest):
        result = _state.store.checkout(req.version_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Version not found")
        _state.df = result
        return {
            "success": True,
            "preview": _state.df.head(100).to_dicts(),
            "versions": _state.store.get_timeline(),
            "currentId": _state.store.current_id,
        }

    # ── SQL ──

    @app.post("/schema", tags=["SQL"])
    def schema(req: SchemaRequest):
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")
        result = generate_schema(_state.df, table_name=req.table_name, engine=req.engine)
        return {"sql": result.query, "indexes": result.suggested_indexes, "explanation": result.explanation}

    @app.post("/optimize", tags=["SQL"])
    def optimize(req: OptimizeRequest):
        result = optimize_query(req.query, engine=req.engine)
        return {
            "sql": result.query,
            "originalSql": result.original_query,
            "changes": result.changes,
            "indexes": result.suggested_indexes,
            "explanation": result.explanation,
        }

    @app.post("/query", tags=["SQL"])
    def query(req: QueryRequest):
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")
        try:
            result = run_query(_state.df, req.query, req.table_name)
            return {"success": True, "preview": result.head(100).to_dicts(),
                    "rowCount": result.height, "colCount": result.width}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    # ── Export ──

    @app.post("/export", tags=["Export"])
    def export(req: ExportRequest):
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")

        from pathlib import Path
        from pureql.cleaning.pipeline_exporter import export_pipeline

        fmt = req.format
        path = req.path

        try:
            if fmt == "csv":
                _state.df.write_csv(path)
            elif fmt == "parquet":
                _state.df.write_parquet(path)
            elif fmt == "json":
                _state.df.write_json(path)
            elif fmt == "xlsx":
                _state.df.write_excel(path)
            elif fmt == "py":
                export_pipeline(
                    versions=_state.store.get_timeline(),
                    source_path=_state.dataset_name,
                    output_path=path,
                    table_name=req.table_name or "data",
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown format: {fmt}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        return {"success": True, "path": path, "format": fmt}

    # ── Settings & API Keys ──

    @app.post("/settings", tags=["Settings"])
    def settings(req: SettingsRequest):
        if req.model:
            _state.ai_model = req.model
        if req.provider:
            _state.ai_provider = req.provider
        if req.api_key and _state.ai_provider:
            save_api_key(_state.ai_provider, req.api_key)
        return {
            "model": _state.ai_model,
            "provider": _state.ai_provider,
            "hasApiKey": has_api_key(_state.ai_provider),
        }

    @app.post("/apikey/save", tags=["Settings"])
    def save_key(req: ApiKeyRequest):
        save_api_key(req.provider, req.api_key)
        return {"success": True, "provider": req.provider}

    @app.delete("/apikey/{provider}", tags=["Settings"])
    def delete_key(provider: str):
        delete_api_key(provider)
        return {"success": True, "provider": provider}

    @app.get("/apikey/{provider}/exists", tags=["Settings"])
    def check_key(provider: str):
        return {"provider": provider, "hasKey": has_api_key(provider)}

    # ── Database ──

    @app.get("/db/engines", tags=["Database"])
    def db_engines():
        return {"engines": [
            {"id": k, "name": v["name"], "icon": v["icon"], "defaultPort": v["default_port"]}
            for k, v in SUPPORTED_ENGINES.items()
        ]}

    @app.post("/db/connect", tags=["Database"])
    def db_connect_endpoint(req: DbConnectRequest):
        uri = req.uri or build_uri(
            engine_type=req.engine_type, host=req.host, port=req.port,
            database=req.database, user=req.user, password=req.password, path=req.path,
        )
        name = req.name or req.engine_type
        conn = db_connect(uri=uri, name=name, engine_type=req.engine_type)
        _state.connections.add(conn)

        if conn.connected:
            tables = get_tables(conn)
            return {"success": True, "connection": conn.to_dict(), "tables": [t.to_dict() for t in tables]}
        return {"success": False, "connection": conn.to_dict(), "error": conn.error}

    @app.post("/db/test", tags=["Database"])
    def db_test(req: DbConnectRequest):
        uri = req.uri or build_uri(
            engine_type=req.engine_type, host=req.host, port=req.port,
            database=req.database, user=req.user, password=req.password, path=req.path,
        )
        return test_connection(uri)

    @app.post("/db/read", tags=["Database"])
    def db_read(req: DbReadRequest):
        conn = _state.connections.get(req.connection)
        if not conn or not conn.connected:
            raise HTTPException(status_code=400, detail=f"Connection '{req.connection}' not found.")
        df = read_table(conn, req.table, columns=req.columns, limit=req.limit, where=req.where)
        _state.df = df
        _state.dataset_name = f"{req.connection}:{req.table}"
        prof = profile(_state.df)
        _state.store = VersionStore()
        _state.store.create_initial(_state.df, quality_score=prof.quality_score)
        return {
            "success": True,
            "datasetName": _state.dataset_name,
            "profile": prof.to_dict(),
            "preview": _state.df.head(100).to_dicts(),
            "versions": _state.store.get_timeline(),
        }

    @app.post("/db/write", tags=["Database"])
    def db_write(req: DbWriteRequest):
        if _state.df is None:
            raise HTTPException(status_code=400, detail="No dataset loaded")
        conn = _state.connections.get(req.connection)
        if not conn or not conn.connected:
            raise HTTPException(status_code=400, detail=f"Connection '{req.connection}' not found.")
        return write_table(conn, _state.df, req.table, if_exists=req.if_exists)

    return app


# ── Action executor (shared logic) ──

def _execute_action(action_type: str, params: dict, target: str) -> dict:
    """Execute a cleaning/SQL action on the current state."""
    if _state.df is None:
        return {"success": False, "description": "No dataset loaded."}

    df = _state.df

    try:
        if action_type == "deduplicate":
            result = deduplicate(df, strategy=params.get("strategy", "exact"),
                                 subset=params.get("subset"), threshold=params.get("threshold", 0.85))
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
                from pureql.cleaning.ml_imputation import fill_nulls_ml
                cleaned, stats = fill_nulls_ml(df, column=column, strategy=params.get("ml_strategy", "knn"))
                _state.df = cleaned
                prof = profile(_state.df)
                version = _state.store.commit(
                    df=_state.df, operation="fill_nulls_ml",
                    description=f"ML imputation: {stats['rows_changed']} values predicted.",
                    quality_score=prof.quality_score, rows_affected=stats["rows_changed"],
                )
                return {"success": True, "description": f"ML imputation: {stats['rows_changed']} values filled.",
                        "quality_score": prof.quality_score, "rows_affected": stats["rows_changed"],
                        "version": {"id": version.id, "label": version.label}}
            else:
                result = fill_nulls(df, column=column, strategy=strategy)
        elif action_type == "remove_outliers":
            column = target.replace("column:", "") if target.startswith("column:") else params.get("column", "")
            result = remove_outliers(df, column, method=params.get("method", "iqr"),
                                     threshold=params.get("threshold", 1.5))
        elif action_type == "drop_columns":
            result = drop_columns(df, params.get("columns", []))
        elif action_type == "rename_column":
            result = rename_column(df, params.get("from", ""), params.get("to", ""))
        elif action_type == "filter_rows":
            result = filter_rows(df, params.get("condition", ""))
        elif action_type == "generate_sql":
            schema_result = generate_schema(df, table_name=params.get("table_name", "data"),
                                            engine=params.get("engine", "postgresql"))
            return {"success": True, "description": schema_result.explanation,
                    "sql": schema_result.query, "indexes": schema_result.suggested_indexes, "rows_affected": 0}
        elif action_type == "optimize_sql":
            opt_result = optimize_query(params.get("query", ""), engine=params.get("engine", "postgresql"))
            return {"success": True, "description": opt_result.explanation,
                    "sql": opt_result.query, "changes": opt_result.changes, "rows_affected": 0}
        elif action_type == "profile":
            prof = profile(df)
            return {"success": True, "description": f"Score: {prof.quality_score}/100.",
                    "profile": prof.to_dict(), "rows_affected": 0}
        else:
            return {"success": False, "description": f"Unknown action: {action_type}"}

        _state.df = result.df
        prof = profile(_state.df)
        version = _state.store.commit(
            df=_state.df, operation=action_type, description=result.description,
            quality_score=prof.quality_score, rows_affected=result.rows_affected,
        )
        return {
            "success": True, "description": result.description,
            "quality_score": prof.quality_score, "rows_affected": result.rows_affected,
            "version": {"id": version.id, "label": version.label},
        }

    except Exception as e:
        return {"success": False, "description": f"Error: {str(e)}"}


# ── Entry Point ──

def create_app_or_error():
    """Create app, or raise ImportError with install instructions."""
    _require_fastapi()
    return create_app()


# Allow: uvicorn pureql.server:app
try:
    app = create_app()
except ImportError:
    app = None  # type: ignore


if __name__ == "__main__":
    import sys
    try:
        import uvicorn
    except ImportError:
        print("Install uvicorn: pip install uvicorn", file=sys.stderr)
        sys.exit(1)

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9742
    print(f"PureQL FastAPI server starting on http://127.0.0.1:{port}/docs")
    uvicorn.run(create_app(), host="127.0.0.1", port=port, log_level="info")
