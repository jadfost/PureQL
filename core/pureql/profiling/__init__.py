"""Auto profiling — analyzes a dataset and produces a quality report."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl


@dataclass
class ColumnProfile:
    """Profile for a single column."""
    name: str
    dtype: str
    null_count: int
    null_pct: float
    unique_count: int
    unique_pct: float
    sample_values: list[str]
    min_value: Any = None
    max_value: Any = None
    mean_value: float | None = None
    issues: list[str] = field(default_factory=list)


@dataclass
class DataProfile:
    """Complete profile for a dataset."""
    row_count: int
    col_count: int
    quality_score: int  # 0-100
    columns: list[ColumnProfile]
    issues: list[str]
    duplicate_count: int
    memory_mb: float

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "rowCount": self.row_count,
            "colCount": self.col_count,
            "qualityScore": self.quality_score,
            "columns": [
                {
                    "name": c.name,
                    "type": c.dtype,
                    "nullCount": c.null_count,
                    "nullPct": round(c.null_pct, 2),
                    "uniqueCount": c.unique_count,
                    "uniquePct": round(c.unique_pct, 2),
                    "sampleValues": c.sample_values,
                    "issues": c.issues,
                }
                for c in self.columns
            ],
            "issues": self.issues,
            "duplicateCount": self.duplicate_count,
            "memoryMb": round(self.memory_mb, 2),
        }


def profile(df: pl.DataFrame) -> DataProfile:
    """Analyze a Polars DataFrame and return a quality profile.

    Args:
        df: The DataFrame to profile.

    Returns:
        A DataProfile with quality score, column stats, and detected issues.
    """
    row_count = df.height
    col_count = df.width
    issues: list[str] = []
    column_profiles: list[ColumnProfile] = []

    # Detect duplicates
    duplicate_count = row_count - df.unique().height

    if duplicate_count > 0:
        dup_pct = round(duplicate_count / row_count * 100, 1)
        issues.append(f"{duplicate_count:,} duplicate rows detected ({dup_pct}%)")

    # Memory estimation
    memory_mb = df.estimated_size("mb")

    # Profile each column
    for col_name in df.columns:
        col = df[col_name]
        dtype_str = str(col.dtype)
        null_count = col.null_count()
        null_pct = null_count / row_count * 100 if row_count > 0 else 0
        unique_count = col.n_unique()
        unique_pct = unique_count / row_count * 100 if row_count > 0 else 0

        # Sample values (non-null, up to 5)
        non_null = col.drop_nulls()
        sample_values = [
            str(v) for v in non_null.head(5).to_list()
        ]

        col_issues: list[str] = []

        # Check for high null percentage
        if null_pct > 50:
            col_issues.append(f"{null_pct:.0f}% null values")
            issues.append(f"Column '{col_name}': {null_pct:.0f}% null values")

        # Check for potential ID column with duplicates
        if unique_pct > 95 and unique_count < row_count and "id" in col_name.lower():
            col_issues.append("Possible ID column with duplicates")
            issues.append(f"Column '{col_name}': possible ID with {row_count - unique_count} duplicates")

        # Check for low cardinality strings (possible categories)
        if col.dtype == pl.Utf8 and 0 < unique_count <= 50 and row_count > 100:
            # Check for inconsistent casing
            if non_null.cast(pl.Utf8).str.to_lowercase().n_unique() < unique_count:
                col_issues.append(f"Inconsistent casing ({unique_count} variants, could be fewer)")
                issues.append(
                    f"Column '{col_name}': {unique_count} variants with inconsistent casing"
                )

        # Check for mixed date formats in string columns
        if col.dtype == pl.Utf8 and non_null.height > 0:
            sample = non_null.head(100).to_list()
            date_patterns = _detect_date_patterns(sample)
            if len(date_patterns) > 1:
                col_issues.append(f"Mixed date formats: {', '.join(date_patterns)}")
                issues.append(f"Column '{col_name}': mixed date formats detected")

        # Numeric stats
        min_val = None
        max_val = None
        mean_val = None
        if col.dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.Float32, pl.Float64):
            if non_null.height > 0:
                min_val = non_null.min()
                max_val = non_null.max()
                mean_val = non_null.mean()

                # Check for outliers using IQR
                q1 = non_null.quantile(0.25)
                q3 = non_null.quantile(0.75)
                if q1 is not None and q3 is not None:
                    iqr = q3 - q1
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    outlier_count = non_null.filter(
                        (non_null < lower) | (non_null > upper)
                    ).height
                    if outlier_count > 0:
                        col_issues.append(f"{outlier_count} outliers detected (IQR method)")
                        issues.append(f"Column '{col_name}': {outlier_count} outliers")

        column_profiles.append(
            ColumnProfile(
                name=col_name,
                dtype=dtype_str,
                null_count=null_count,
                null_pct=null_pct,
                unique_count=unique_count,
                unique_pct=unique_pct,
                sample_values=sample_values,
                min_value=min_val,
                max_value=max_val,
                mean_value=mean_val,
                issues=col_issues,
            )
        )

    # Calculate quality score
    quality_score = _calculate_quality_score(
        row_count=row_count,
        duplicate_count=duplicate_count,
        column_profiles=column_profiles,
    )

    return DataProfile(
        row_count=row_count,
        col_count=col_count,
        quality_score=quality_score,
        columns=column_profiles,
        issues=issues,
        duplicate_count=duplicate_count,
        memory_mb=memory_mb,
    )


def _calculate_quality_score(
    row_count: int,
    duplicate_count: int,
    column_profiles: list[ColumnProfile],
) -> int:
    """Calculate a 0-100 quality score for the dataset."""
    if row_count == 0:
        return 0

    score = 100.0

    # Penalize duplicates (max -20 points)
    dup_ratio = duplicate_count / row_count
    score -= min(dup_ratio * 100, 20)

    # Penalize nulls (max -30 points)
    total_null_pct = sum(c.null_pct for c in column_profiles) / max(len(column_profiles), 1)
    score -= min(total_null_pct * 0.6, 30)

    # Penalize column issues (max -30 points)
    total_issues = sum(len(c.issues) for c in column_profiles)
    score -= min(total_issues * 5, 30)

    # Penalize very low unique ratios in non-ID columns (potential data quality issue)
    for c in column_profiles:
        if c.unique_pct < 1 and c.null_pct < 50 and "id" not in c.name.lower():
            score -= 2

    return max(0, min(100, round(score)))


def _detect_date_patterns(values: list[str]) -> set[str]:
    """Detect common date format patterns in a list of string values."""
    import re

    patterns_found = set()
    date_regexes = {
        "YYYY-MM-DD": r"^\d{4}-\d{2}-\d{2}$",
        "DD/MM/YYYY": r"^\d{2}/\d{2}/\d{4}$",
        "MM/DD/YYYY": r"^\d{2}/\d{2}/\d{4}$",
        "DD-MM-YYYY": r"^\d{2}-\d{2}-\d{4}$",
        "YYYY/MM/DD": r"^\d{4}/\d{2}/\d{2}$",
    }

    for val in values[:50]:
        val = val.strip()
        for name, regex in date_regexes.items():
            if re.match(regex, val):
                patterns_found.add(name)

    return patterns_found
