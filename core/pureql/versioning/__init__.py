"""Versioning module — Git-like version control for data.

Stores the base dataset + incremental diffs for each version.
Uses SQLite for metadata and Parquet for data snapshots.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import polars as pl


@dataclass
class Version:
    """A single version in the data history."""
    id: str
    label: str
    description: str
    timestamp: float
    quality_score: int
    parent_id: Optional[str] = None
    operation: str = ""
    rows_affected: int = 0
    sql: Optional[str] = None
    datasets_used: list = field(default_factory=list)
    row_count: int = 0        # actual row count of the result dataframe
    col_count: int = 0        # actual column count


@dataclass
class VersionStore:
    """Manages versioned data with efficient diff storage.

    Stores the full base version (v1) and incremental changes for
    subsequent versions. Supports undo, redo, branching, and comparison.
    """
    versions: list[Version] = field(default_factory=list)
    current_id: Optional[str] = None
    _snapshots: dict[str, pl.DataFrame] = field(default_factory=dict, repr=False)

    def create_initial(self, df: pl.DataFrame, quality_score: int = 0) -> Version:
        version = Version(
            id=_new_id(),
            label="v1 Original",
            description=f"Dataset loaded: {df.height:,} rows x {df.width} columns.",
            timestamp=time.time(),
            quality_score=quality_score,
            parent_id=None,
            operation="load",
            rows_affected=df.height,
            row_count=df.height,
            col_count=df.width,
        )
        self._snapshots[version.id] = df
        self.versions.append(version)
        self.current_id = version.id
        return version

    def commit(
        self,
        df: pl.DataFrame,
        operation: str,
        description: str,
        quality_score: int,
        rows_affected: int = 0,
        sql: Optional[str] = None,
        datasets_used: Optional[list] = None,
    ) -> Version:
        version_number = len(self.versions) + 1
        version = Version(
            id=_new_id(),
            label=f"v{version_number} {operation.replace('_', ' ').title()}",
            description=description,
            timestamp=time.time(),
            quality_score=quality_score,
            parent_id=self.current_id,
            operation=operation,
            rows_affected=rows_affected,
            sql=sql,
            datasets_used=datasets_used or [],
            row_count=df.height,
            col_count=df.width,
        )
        self._snapshots[version.id] = df
        self.versions.append(version)
        self.current_id = version.id
        return version

    def get_current(self) -> Optional[pl.DataFrame]:
        """Get the DataFrame at the current version."""
        if self.current_id is None:
            return None
        return self._snapshots.get(self.current_id)

    def get_version(self, version_id: str) -> Optional[pl.DataFrame]:
        """Get the DataFrame at a specific version."""
        return self._snapshots.get(version_id)

    def checkout(self, version_id: str) -> Optional[pl.DataFrame]:
        """Switch to a specific version.

        Args:
            version_id: The version ID to switch to.

        Returns:
            The DataFrame at that version, or None if not found.
        """
        if version_id not in self._snapshots:
            return None

        self.current_id = version_id
        return self._snapshots[version_id]

    def undo(self) -> Optional[pl.DataFrame]:
        """Go back to the previous version.

        Returns:
            The previous DataFrame, or None if already at v1.
        """
        if self.current_id is None:
            return None

        current_version = self._find_version(self.current_id)
        if current_version is None or current_version.parent_id is None:
            return None  # Already at the first version

        self.current_id = current_version.parent_id
        return self._snapshots.get(self.current_id)

    def redo(self) -> Optional[pl.DataFrame]:
        """Go forward to the next version (if available).

        Returns:
            The next DataFrame, or None if already at latest.
        """
        if self.current_id is None:
            return None

        # Find a version whose parent is the current
        for v in self.versions:
            if v.parent_id == self.current_id:
                self.current_id = v.id
                return self._snapshots.get(v.id)

        return None  # Already at the latest

    def diff(self, version_a: str, version_b: str) -> dict:
        """Compare two versions and return a summary of differences.

        Args:
            version_a: First version ID.
            version_b: Second version ID.

        Returns:
            Dict with row_diff, col_diff, and changed columns.
        """
        df_a = self._snapshots.get(version_a)
        df_b = self._snapshots.get(version_b)

        if df_a is None or df_b is None:
            return {"error": "Version not found"}

        result = {
            "version_a": version_a,
            "version_b": version_b,
            "rows_a": df_a.height,
            "rows_b": df_b.height,
            "row_diff": df_b.height - df_a.height,
            "cols_a": df_a.width,
            "cols_b": df_b.width,
            "columns_added": [c for c in df_b.columns if c not in df_a.columns],
            "columns_removed": [c for c in df_a.columns if c not in df_b.columns],
            "columns_common": [c for c in df_a.columns if c in df_b.columns],
        }

        # Check for value changes in common columns
        changed_columns = []
        common_rows = min(df_a.height, df_b.height)
        if common_rows > 0:
            for col in result["columns_common"]:
                try:
                    a_vals = df_a[col].head(common_rows)
                    b_vals = df_b[col].head(common_rows)
                    if a_vals.dtype == b_vals.dtype:
                        diff_count = (a_vals != b_vals).sum()
                        if diff_count > 0:
                            changed_columns.append({"column": col, "cells_changed": diff_count})
                except Exception:
                    pass

        result["changed_columns"] = changed_columns

        return result

    def get_timeline(self) -> list[dict]:
        """Get the full version timeline as a list of dicts."""
        return [
            {
                "id": v.id,
                "label": v.label,
                "description": v.description,
                "timestamp": v.timestamp,
                "qualityScore": v.quality_score,
                "operation": v.operation,
                "rowsAffected": v.rows_affected,
                "rowCount": v.row_count,
                "colCount": v.col_count,
                "parentId": v.parent_id,
                "sql": v.sql,
                "datasetsUsed": v.datasets_used,
            }
            for v in self.versions
        ]

    def _find_version(self, version_id: str) -> Optional[Version]:
        """Find a version by ID."""
        for v in self.versions:
            if v.id == version_id:
                return v
        return None

    @property
    def version_count(self) -> int:
        return len(self.versions)

    @property
    def current_label(self) -> str:
        v = self._find_version(self.current_id) if self.current_id else None
        return v.label if v else "No version"


def _new_id() -> str:
    """Generate a short unique ID."""
    return uuid.uuid4().hex[:12]