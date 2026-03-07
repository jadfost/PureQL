"""Cleaning module — intelligent data cleaning operations.

All operations return a new DataFrame (immutable) and a summary of changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import polars as pl
from rapidfuzz import fuzz

# ML and semantic sub-modules (lazy imports to avoid hard dependencies)
from pureql.cleaning.ml_imputation import fill_nulls_ml
from pureql.cleaning.semantic_dedup import deduplicate_semantic
from pureql.cleaning.pipeline_exporter import export_pipeline


@dataclass
class CleaningResult:
    """Result of a cleaning operation."""
    df: pl.DataFrame
    operation: str
    rows_affected: int
    description: str
    details: dict = field(default_factory=dict)


# ── Deduplication ──


def deduplicate(
    df: pl.DataFrame,
    strategy: str = "exact",
    subset: Optional[list[str]] = None,
    threshold: float = 0.85,
) -> CleaningResult:
    """Remove duplicate rows.

    Args:
        df: Input DataFrame.
        strategy: "exact" for exact matches, "fuzzy" for similarity-based.
        subset: Column names to consider. None = all columns.
        threshold: Similarity threshold for fuzzy matching (0.0-1.0).

    Returns:
        CleaningResult with deduplicated DataFrame.
    """
    original_count = df.height

    if strategy == "exact":
        cleaned = df.unique(subset=subset, maintain_order=True)
        removed = original_count - cleaned.height

        return CleaningResult(
            df=cleaned,
            operation="deduplicate_exact",
            rows_affected=removed,
            description=f"Removed {removed:,} exact duplicate rows.",
            details={"strategy": "exact", "subset": subset or "all"},
        )

    elif strategy == "fuzzy":
        if subset is None:
            str_cols = [c for c in df.columns if df[c].dtype == pl.Utf8]
            if not str_cols:
                return CleaningResult(
                    df=df, operation="deduplicate_fuzzy", rows_affected=0,
                    description="No string columns found for fuzzy deduplication.",
                )
            subset = str_cols

        cleaned, removed = _fuzzy_deduplicate(df, subset, threshold)

        return CleaningResult(
            df=cleaned,
            operation="deduplicate_fuzzy",
            rows_affected=removed,
            description=f"Removed {removed:,} fuzzy duplicate rows (threshold: {threshold}).",
            details={"strategy": "fuzzy", "threshold": threshold, "subset": subset},
        )

    else:
        raise ValueError(f"Unknown dedup strategy: {strategy}. Use 'exact' or 'fuzzy'.")


def _fuzzy_deduplicate(
    df: pl.DataFrame,
    subset: list[str],
    threshold: float,
) -> tuple[pl.DataFrame, int]:
    """Fuzzy deduplication using rapidfuzz."""
    composite = df.select(
        pl.concat_str([pl.col(c).cast(pl.Utf8).fill_null("") for c in subset], separator=" | ")
        .alias("__composite__")
    )["__composite__"].to_list()

    to_remove = set()
    for i in range(len(composite)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(composite)):
            if j in to_remove:
                continue
            similarity = fuzz.ratio(composite[i], composite[j]) / 100.0
            if similarity >= threshold:
                to_remove.add(j)

    keep_mask = [i not in to_remove for i in range(df.height)]
    cleaned = df.filter(pl.Series(keep_mask))

    return cleaned, len(to_remove)


# ── Standardization ──


def standardize(
    df: pl.DataFrame,
    column: str,
    method: str = "cluster_merge",
) -> CleaningResult:
    """Standardize values in a column.

    Args:
        df: Input DataFrame.
        column: Column name to standardize.
        method: "lowercase", "uppercase", "titlecase", or "cluster_merge".
    """
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found in DataFrame.")

    if df[column].dtype != pl.Utf8:
        raise ValueError(f"Column '{column}' is not a string column (type: {df[column].dtype}).")

    original_unique = df[column].n_unique()

    if method == "lowercase":
        cleaned = df.with_columns(pl.col(column).str.to_lowercase())
    elif method == "uppercase":
        cleaned = df.with_columns(pl.col(column).str.to_uppercase())
    elif method == "titlecase":
        cleaned = df.with_columns(pl.col(column).str.to_titlecase())
    elif method == "cluster_merge":
        cleaned = _cluster_merge(df, column)
    else:
        raise ValueError(f"Unknown method: {method}")

    new_unique = cleaned[column].n_unique()
    cells_changed = (df[column] != cleaned[column]).sum()

    return CleaningResult(
        df=cleaned,
        operation="standardize",
        rows_affected=cells_changed,
        description=f"Standardized '{column}': {original_unique} -> {new_unique} unique values. {cells_changed:,} cells changed.",
        details={"column": column, "method": method, "before_unique": original_unique, "after_unique": new_unique},
    )


def _cluster_merge(df: pl.DataFrame, column: str, threshold: float = 80) -> pl.DataFrame:
    """Cluster similar values and merge them into the most common form."""
    values = df[column].drop_nulls().to_list()
    unique_values = list(set(values))

    if len(unique_values) <= 1:
        return df

    clusters: dict[str, str] = {}
    processed = set()

    value_counts = df[column].value_counts().sort("count", descending=True)
    sorted_values = value_counts[column].to_list()

    for canonical in sorted_values:
        if canonical is None or canonical in processed:
            continue
        processed.add(canonical)
        clusters[canonical] = canonical

        for other in unique_values:
            if other is None or other in processed:
                continue
            similarity = fuzz.ratio(canonical.lower(), other.lower())
            if similarity >= threshold:
                clusters[other] = canonical
                processed.add(other)

    mapping_expr = pl.col(column)
    for original, replacement in clusters.items():
        if original != replacement:
            mapping_expr = (
                pl.when(pl.col(column) == original)
                .then(pl.lit(replacement))
                .otherwise(mapping_expr)
            )

    return df.with_columns(mapping_expr.alias(column))


# ── Format Fixing ──


def fix_formats(
    df: pl.DataFrame,
    column: Optional[str] = None,
    format_type: str = "auto",
) -> CleaningResult:
    """Fix inconsistent formats (whitespace, emails, etc.)."""
    total_fixed = 0
    cleaned = df.clone()
    descriptions = []

    columns_to_fix = [column] if column else df.columns

    for col_name in columns_to_fix:
        if col_name not in cleaned.columns or cleaned[col_name].dtype != pl.Utf8:
            continue

        if format_type in ("auto", "emails"):
            sample = cleaned[col_name].drop_nulls().head(20).to_list()
            if any("@" in str(v) for v in sample):
                before = cleaned[col_name]
                cleaned = cleaned.with_columns(
                    pl.col(col_name).str.to_lowercase().str.strip_chars().alias(col_name)
                )
                fixed = (before != cleaned[col_name]).sum()
                if fixed > 0:
                    total_fixed += fixed
                    descriptions.append(f"'{col_name}': {fixed} emails normalized")

        if format_type in ("auto", "whitespace"):
            before = cleaned[col_name]
            cleaned = cleaned.with_columns(
                pl.col(col_name).str.strip_chars().alias(col_name)
            )
            fixed = (before != cleaned[col_name]).sum()
            if fixed > 0:
                total_fixed += fixed
                descriptions.append(f"'{col_name}': {fixed} whitespace issues fixed")

    return CleaningResult(
        df=cleaned,
        operation="fix_formats",
        rows_affected=total_fixed,
        description="; ".join(descriptions) if descriptions else "No format issues found.",
        details={"format_type": format_type, "column": column},
    )


# ── Null Handling ──


def fill_nulls(
    df: pl.DataFrame,
    column: Optional[str] = None,
    strategy: str = "mode",
) -> CleaningResult:
    """Fill null values using the specified strategy."""
    total_filled = 0
    cleaned = df.clone()
    descriptions = []

    columns_to_fix = [column] if column else [c for c in df.columns if df[c].null_count() > 0]

    for col_name in columns_to_fix:
        if col_name not in cleaned.columns:
            continue

        null_count = cleaned[col_name].null_count()
        if null_count == 0:
            continue

        col_dtype = cleaned[col_name].dtype
        is_numeric = col_dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.Float32, pl.Float64)

        if strategy == "mean" and is_numeric:
            cleaned = cleaned.with_columns(pl.col(col_name).fill_null(pl.col(col_name).mean()))
        elif strategy == "median" and is_numeric:
            cleaned = cleaned.with_columns(pl.col(col_name).fill_null(pl.col(col_name).median()))
        elif strategy == "mode":
            mode_val = cleaned[col_name].drop_nulls().mode()
            if mode_val.len() > 0:
                cleaned = cleaned.with_columns(pl.col(col_name).fill_null(pl.lit(mode_val[0])))
        elif strategy == "forward":
            cleaned = cleaned.with_columns(pl.col(col_name).forward_fill())
        elif strategy == "zero":
            fill_val = 0 if is_numeric else ""
            cleaned = cleaned.with_columns(pl.col(col_name).fill_null(pl.lit(fill_val)))
        else:
            continue

        filled = null_count - cleaned[col_name].null_count()
        total_filled += filled
        descriptions.append(f"'{col_name}': {filled} nulls filled ({strategy})")

    return CleaningResult(
        df=cleaned,
        operation="fill_nulls",
        rows_affected=total_filled,
        description="; ".join(descriptions) if descriptions else "No nulls to fill.",
        details={"strategy": strategy, "column": column},
    )


# ── Outlier Removal ──


def remove_outliers(
    df: pl.DataFrame,
    column: str,
    method: str = "iqr",
    threshold: float = 1.5,
) -> CleaningResult:
    """Remove outlier rows based on a numeric column."""
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found.")

    col = df[column].drop_nulls()

    if method == "iqr":
        q1 = col.quantile(0.25)
        q3 = col.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - threshold * iqr
        upper = q3 + threshold * iqr

        cleaned = df.filter(
            (pl.col(column).is_null()) |
            ((pl.col(column) >= lower) & (pl.col(column) <= upper))
        )

    elif method == "zscore":
        mean = col.mean()
        std = col.std()
        if std == 0 or std is None:
            return CleaningResult(
                df=df, operation="remove_outliers", rows_affected=0,
                description=f"No outliers: column '{column}' has zero variance.",
            )
        cleaned = df.filter(
            (pl.col(column).is_null()) |
            (((pl.col(column) - mean) / std).abs() <= threshold)
        )
    else:
        raise ValueError(f"Unknown method: {method}. Use 'iqr' or 'zscore'.")

    removed = df.height - cleaned.height

    return CleaningResult(
        df=cleaned,
        operation="remove_outliers",
        rows_affected=removed,
        description=f"Removed {removed:,} outlier rows from '{column}' ({method}, threshold={threshold}).",
        details={"column": column, "method": method, "threshold": threshold},
    )


# ── Column Operations ──


def drop_columns(df: pl.DataFrame, columns: list[str]) -> CleaningResult:
    """Drop specified columns."""
    existing = [c for c in columns if c in df.columns]
    cleaned = df.drop(existing)
    return CleaningResult(
        df=cleaned, operation="drop_columns", rows_affected=0,
        description=f"Dropped {len(existing)} columns: {', '.join(existing)}.",
        details={"columns": existing},
    )


def rename_column(df: pl.DataFrame, old_name: str, new_name: str) -> CleaningResult:
    """Rename a column."""
    if old_name not in df.columns:
        raise ValueError(f"Column '{old_name}' not found.")
    cleaned = df.rename({old_name: new_name})
    return CleaningResult(
        df=cleaned, operation="rename_column", rows_affected=0,
        description=f"Renamed '{old_name}' -> '{new_name}'.",
        details={"from": old_name, "to": new_name},
    )


def filter_rows(df: pl.DataFrame, condition: str) -> CleaningResult:
    """Filter rows using a SQL-like condition via DuckDB."""
    import duckdb
    rel = duckdb.sql(f"SELECT * FROM df WHERE {condition}")
    cleaned = rel.pl()
    removed = df.height - cleaned.height
    return CleaningResult(
        df=cleaned, operation="filter_rows", rows_affected=removed,
        description=f"Filtered: {removed:,} rows removed. {cleaned.height:,} remaining.",
        details={"condition": condition},
    )


# ── Auto Clean ──


def auto_clean(df: pl.DataFrame) -> tuple[pl.DataFrame, list[CleaningResult]]:
    """Automatically clean a DataFrame with sensible defaults.

    Applies: dedup -> fix formats -> standardize strings -> fill nulls.
    """
    results = []
    current = df

    # 1. Exact deduplication
    r = deduplicate(current, strategy="exact")
    if r.rows_affected > 0:
        current = r.df
        results.append(r)

    # 2. Fix formats
    r = fix_formats(current, format_type="auto")
    if r.rows_affected > 0:
        current = r.df
        results.append(r)

    # 3. Standardize string columns with low cardinality
    for col_name in current.columns:
        col = current[col_name]
        if col.dtype == pl.Utf8:
            unique = col.n_unique()
            if 2 <= unique <= 100 and current.height > 20:
                lower_unique = col.drop_nulls().cast(pl.Utf8).str.to_lowercase().n_unique()
                if lower_unique < unique:
                    r = standardize(current, col_name, method="cluster_merge")
                    if r.rows_affected > 0:
                        current = r.df
                        results.append(r)

    # 4. Fill nulls with mode
    r = fill_nulls(current, strategy="mode")
    if r.rows_affected > 0:
        current = r.df
        results.append(r)

    return current, results
