"""ML-based null imputation — KNN and RandomForest strategies.

Uses scikit-learn to predict missing values from other columns.
Falls back gracefully if sklearn is not installed or data is insufficient.
"""

from __future__ import annotations

from typing import Optional
import polars as pl


def fill_nulls_ml(
    df: pl.DataFrame,
    column: Optional[str] = None,
    strategy: str = "knn",
    n_neighbors: int = 5,
) -> tuple[pl.DataFrame, dict]:
    """Fill null values using ML-based imputation.

    Args:
        df: Input DataFrame.
        column: Specific column to impute (None = all numeric columns with nulls).
        strategy: "knn" (KNNImputer) or "rf" (RandomForest iterative imputer).
        n_neighbors: Number of neighbors for KNN strategy.

    Returns:
        Tuple of (cleaned DataFrame, stats dict).
    """
    try:
        import numpy as np
        from sklearn.impute import KNNImputer
        from sklearn.experimental import enable_iterative_imputer  # noqa: F401
        from sklearn.impute import IterativeImputer
        from sklearn.ensemble import RandomForestRegressor
    except ImportError:
        # Graceful fallback: use mode imputation
        return _fallback_impute(df, column)

    # Select columns to impute
    numeric_cols = [
        c for c in df.columns
        if df[c].dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                            pl.Float32, pl.Float64)
        and (column is None or c == column)
        and df[c].null_count() > 0
    ]

    if not numeric_cols:
        return df, {"imputed": [], "strategy": strategy, "rows_changed": 0}

    # Need at least some non-null numeric columns as features
    feature_cols = [
        c for c in df.columns
        if df[c].dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                            pl.Float32, pl.Float64)
    ]

    if len(feature_cols) < 2:
        return _fallback_impute(df, column)

    # Convert to numpy, preserving all numeric columns
    try:
        pdf = df.select(feature_cols).to_pandas()
        arr = pdf.values.astype(float)

        # Replace inf with nan
        arr[~np.isfinite(arr)] = np.nan

        if strategy == "knn":
            imputer = KNNImputer(n_neighbors=min(n_neighbors, max(1, _count_complete_rows(arr) - 1)))
        else:  # rf
            rf = RandomForestRegressor(n_estimators=50, random_state=42, n_jobs=-1)
            imputer = IterativeImputer(estimator=rf, max_iter=20, tol=1e-3, random_state=42)

        imputed_arr = imputer.fit_transform(arr)

        # Build back the DataFrame — only replace the columns we had nulls in
        stats = {"imputed": [], "strategy": strategy, "rows_changed": 0}
        result = df.clone()

        for i, col_name in enumerate(feature_cols):
            if col_name not in numeric_cols:
                continue

            original_nulls = df[col_name].null_count()
            if original_nulls == 0:
                continue

            imputed_values = imputed_arr[:, i]
            original_dtype = df[col_name].dtype

            # Cast back to original type
            new_series = pl.Series(col_name, imputed_values)
            if original_dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64):
                new_series = new_series.round(0).cast(original_dtype)
            else:
                new_series = new_series.cast(original_dtype)

            result = result.with_columns(new_series)
            remaining_nulls = result[col_name].null_count()
            filled = original_nulls - remaining_nulls

            if filled > 0:
                stats["imputed"].append({
                    "column": col_name,
                    "filled": filled,
                    "method": strategy,
                })
                stats["rows_changed"] += filled

        return result, stats

    except Exception:
        return _fallback_impute(df, column)


def _count_complete_rows(arr) -> int:
    """Count rows with no NaN values."""
    import numpy as np
    return int(np.sum(~np.any(np.isnan(arr), axis=1)))


def _fallback_impute(df: pl.DataFrame, column: Optional[str]) -> tuple[pl.DataFrame, dict]:
    """Fallback: use mode/mean imputation if sklearn is unavailable."""
    result = df.clone()
    stats = {"imputed": [], "strategy": "fallback_mode", "rows_changed": 0}

    cols = [column] if column else [
        c for c in df.columns if df[c].null_count() > 0
    ]

    for col_name in cols:
        if col_name not in df.columns:
            continue
        col = result[col_name]
        if col.null_count() == 0:
            continue

        dtype = col.dtype
        is_numeric = dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                                pl.Float32, pl.Float64)

        try:
            if is_numeric:
                fill_val = col.drop_nulls().mean()
            else:
                mode = col.drop_nulls().mode()
                fill_val = mode[0] if mode.len() > 0 else None

            if fill_val is not None:
                filled_before = col.null_count()
                result = result.with_columns(
                    pl.col(col_name).fill_null(pl.lit(fill_val))
                )
                filled = filled_before - result[col_name].null_count()
                if filled > 0:
                    stats["imputed"].append({"column": col_name, "filled": filled, "method": "mean/mode"})
                    stats["rows_changed"] += filled
        except Exception:
            continue

    return result, stats