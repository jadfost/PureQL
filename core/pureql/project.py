"""PureQL Project Manager — Save and load full project state as .pureql files.

A .pureql file is a ZIP archive containing:
  manifest.json       — project metadata (name, created, modified, pureql version)
  settings.json       — AI model/provider settings (no API keys)
  chat_history.json   — conversation messages
  db_connections.json — DB connection names/types (no passwords)
  datasets/
    {name}.parquet    — each loaded dataset as parquet
  versions/
    metadata.json     — all version metadata
    {id}.parquet      — snapshot for each version
"""

from __future__ import annotations

import io
import json
import time
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

import polars as pl

PUREQL_VERSION = "0.1.0"
RECENT_PROJECTS_PATH = Path.home() / ".pureql" / "recent_projects.json"
MAX_RECENT = 10


def get_default_project_dir() -> Path:
    """Return the canonical PureQL projects folder, creating it if needed.

    Tries ~/Documents/PureQL first (familiar to most users).
    Falls back to ~/PureQL if Documents doesn't exist (some Linux setups).
    """
    docs = Path.home() / "Documents"
    base = docs / "PureQL" if docs.exists() else Path.home() / "PureQL"
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_default_save_path(project_name: str) -> str:
    """Return the full default .pureql path for a given project name."""
    safe = (
        project_name.strip()
                    .replace("/", "_").replace("\\", "_")
                    .replace(":", "_").replace(" ", "_")
    ) or "untitled"
    return str(get_default_project_dir() / f"{safe}.pureql")


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class ProjectMeta:
    name: str
    created_at: float
    modified_at: float
    pureql_version: str = PUREQL_VERSION
    description: str = ""
    dataset_count: int = 0
    version_count: int = 0


@dataclass
class RecentProject:
    name: str
    path: str
    modified_at: float
    dataset_count: int = 0
    version_count: int = 0


# ── Recent projects registry ──────────────────────────────────────────────────

def _load_recent() -> list[RecentProject]:
    try:
        if RECENT_PROJECTS_PATH.exists():
            data = json.loads(RECENT_PROJECTS_PATH.read_text())
            return [RecentProject(**r) for r in data]
    except Exception:
        pass
    return []


def _save_recent(recents: list[RecentProject]) -> None:
    try:
        RECENT_PROJECTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        RECENT_PROJECTS_PATH.write_text(
            json.dumps([r.__dict__ for r in recents], indent=2)
        )
    except Exception:
        pass


def get_recent_projects() -> list[dict]:
    """Return list of recent project dicts, filtering out files that no longer exist."""
    recents = _load_recent()
    valid = [r for r in recents if Path(r.path).exists()]
    if len(valid) != len(recents):
        _save_recent(valid)
    return [r.__dict__ for r in valid]


def _upsert_recent(path: str, meta: ProjectMeta) -> None:
    recents = _load_recent()
    # Remove existing entry for this path
    recents = [r for r in recents if r.path != path]
    recents.insert(
        0,
        RecentProject(
            name=meta.name,
            path=path,
            modified_at=meta.modified_at,
            dataset_count=meta.dataset_count,
            version_count=meta.version_count,
        ),
    )
    _save_recent(recents[:MAX_RECENT])


def remove_recent(path: str) -> None:
    recents = [r for r in _load_recent() if r.path != path]
    _save_recent(recents)


# ── Save ──────────────────────────────────────────────────────────────────────

def save_project(
    path: str,
    *,
    project_name: str,
    datasets: dict,           # name -> pl.DataFrame
    versions_meta: list[dict],
    version_snapshots: dict,  # version_id -> pl.DataFrame
    current_version_id: Optional[str],
    active_dataset_name: str,
    ai_model: str,
    ai_provider: str,
    chat_history: list[dict],
    db_connections: list[dict],
    created_at: Optional[float] = None,
) -> dict:
    """Serialize the current session into a .pureql file."""
    now = time.time()
    meta = ProjectMeta(
        name=project_name,
        created_at=created_at or now,
        modified_at=now,
        dataset_count=len(datasets),
        version_count=len(versions_meta),
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # manifest
        zf.writestr("manifest.json", json.dumps(asdict(meta), indent=2))

        # settings (no API keys — they live in the OS keychain)
        zf.writestr(
            "settings.json",
            json.dumps(
                {
                    "ai_model": ai_model,
                    "ai_provider": ai_provider,
                    "active_dataset": active_dataset_name,
                    "current_version_id": current_version_id,
                },
                indent=2,
            ),
        )

        # chat history
        zf.writestr("chat_history.json", json.dumps(chat_history, indent=2))

        # db connections (names/types only — no passwords)
        safe_conns = [
            {"name": c.get("name", ""), "engineType": c.get("engineType", ""), "connected": False}
            for c in db_connections
        ]
        zf.writestr("db_connections.json", json.dumps(safe_conns, indent=2))

        # datasets
        for ds_name, df in datasets.items():
            parquet_buf = io.BytesIO()
            df.write_parquet(parquet_buf)
            safe_fname = _safe_filename(ds_name)
            zf.writestr(f"datasets/{safe_fname}.parquet", parquet_buf.getvalue())

        # versions metadata
        zf.writestr("versions/metadata.json", json.dumps(versions_meta, indent=2))

        # version snapshots
        for vid, snap_df in version_snapshots.items():
            snap_buf = io.BytesIO()
            snap_df.write_parquet(snap_buf)
            zf.writestr(f"versions/{vid}.parquet", snap_buf.getvalue())

    # Write to disk
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(buf.getvalue())

    _upsert_recent(str(dest.resolve()), meta)

    return {
        "success": True,
        "path": str(dest.resolve()),
        "name": project_name,
        "size_bytes": dest.stat().st_size,
    }


# ── Load ──────────────────────────────────────────────────────────────────────

def load_project(path: str) -> dict:
    """Deserialize a .pureql file back into session state."""
    src = Path(path)
    if not src.exists():
        raise FileNotFoundError(f"Project file not found: {path}")

    result: dict[str, Any] = {
        "datasets": {},          # name -> pl.DataFrame
        "versions_meta": [],
        "version_snapshots": {}, # id -> pl.DataFrame
        "current_version_id": None,
        "active_dataset_name": "",
        "ai_model": "qwen2.5:7b",
        "ai_provider": "ollama",
        "chat_history": [],
        "db_connections": [],
        "meta": {},
    }

    with zipfile.ZipFile(src, mode="r") as zf:
        names = set(zf.namelist())

        # manifest
        if "manifest.json" in names:
            result["meta"] = json.loads(zf.read("manifest.json"))

        # settings
        if "settings.json" in names:
            settings = json.loads(zf.read("settings.json"))
            result["ai_model"] = settings.get("ai_model", "qwen2.5:7b")
            result["ai_provider"] = settings.get("ai_provider", "ollama")
            result["active_dataset_name"] = settings.get("active_dataset", "")
            result["current_version_id"] = settings.get("current_version_id")

        # chat history
        if "chat_history.json" in names:
            result["chat_history"] = json.loads(zf.read("chat_history.json"))

        # db connections
        if "db_connections.json" in names:
            result["db_connections"] = json.loads(zf.read("db_connections.json"))

        # datasets
        for zname in names:
            if zname.startswith("datasets/") and zname.endswith(".parquet"):
                raw_name = Path(zname).stem  # e.g. "sales_csv"
                df = pl.read_parquet(io.BytesIO(zf.read(zname)))
                result["datasets"][raw_name] = df

        # versions metadata
        if "versions/metadata.json" in names:
            result["versions_meta"] = json.loads(zf.read("versions/metadata.json"))

        # version snapshots
        for zname in names:
            if zname.startswith("versions/") and zname.endswith(".parquet"):
                vid = Path(zname).stem
                snap_df = pl.read_parquet(io.BytesIO(zf.read(zname)))
                result["version_snapshots"][vid] = snap_df

    # Update recent list
    meta = result.get("meta", {})
    _upsert_recent(
        str(src.resolve()),
        ProjectMeta(
            name=meta.get("name", src.stem),
            created_at=meta.get("created_at", time.time()),
            modified_at=time.time(),
            dataset_count=len(result["datasets"]),
            version_count=len(result["versions_meta"]),
        ),
    )

    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_filename(name: str) -> str:
    """Convert dataset name to a safe filename stem."""
    return (
        name.replace("/", "_")
            .replace("\\", "_")
            .replace(":", "_")
            .replace(" ", "_")
    )