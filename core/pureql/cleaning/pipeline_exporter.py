"""Pipeline exporter — generates a reproducible Python script from version history.

Takes the version timeline and produces a self-contained .py file that
a user can run independently to reproduce all cleaning steps.
"""

from __future__ import annotations

import textwrap
from datetime import datetime
from pathlib import Path
from typing import Optional

import polars as pl


def export_pipeline(
    versions: list[dict],
    source_path: Optional[str] = None,
    output_path: Optional[str] = None,
    table_name: str = "data",
) -> str:
    """Generate a reproducible Python pipeline script from version history.

    Args:
        versions: List of version dicts from VersionStore.get_timeline().
        source_path: Original data file path (for the load step).
        output_path: Where to save the .py file (None = return string only).
        table_name: Table name for SQL exports.

    Returns:
        The generated Python script as a string.
    """
    script = _build_script(versions, source_path, table_name)

    if output_path:
        Path(output_path).write_text(script, encoding="utf-8")

    return script


def _build_script(
    versions: list[dict],
    source_path: Optional[str],
    table_name: str,
) -> str:
    """Build the complete pipeline script."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    steps = _versions_to_steps(versions)

    lines = [
        '"""',
        f"PureQL Pipeline — auto-generated on {now}",
        "",
        "This script reproduces all data cleaning steps applied in PureQL.",
        "Run with: python pipeline.py",
        '"""',
        "",
        "import polars as pl",
        "from pathlib import Path",
        "",
    ]

    # Optional sklearn import if ML imputation was used
    if any(s["op"] in ("fill_nulls_ml",) for s in steps):
        lines += [
            "from sklearn.impute import KNNImputer",
            "from sklearn.experimental import enable_iterative_imputer  # noqa",
            "from sklearn.impute import IterativeImputer",
            "",
        ]

    lines += [
        "",
        "# ── Step 1: Load Data ────────────────────────────────────────",
    ]

    if source_path:
        ext = Path(source_path).suffix.lower()
        load_fn = {
            ".csv": f'df = pl.read_csv(r"{source_path}")',
            ".json": f'df = pl.read_json(r"{source_path}")',
            ".parquet": f'df = pl.read_parquet(r"{source_path}")',
            ".xlsx": f'df = pl.read_excel(r"{source_path}")',
            ".xls": f'df = pl.read_excel(r"{source_path}")',
        }.get(ext, f'df = pl.read_csv(r"{source_path}")')
        lines.append(load_fn)
    else:
        lines += [
            "# TODO: Replace with your actual file path",
            'df = pl.read_csv("your_data.csv")',
        ]

    lines += [
        f'print(f"Loaded: {{df.height:,}} rows x {{df.width}} columns")',
        "",
    ]

    # Generate step code
    for i, step in enumerate(steps, start=2):
        lines += _step_to_code(step, i)

    # Final output
    lines += [
        "",
        f"# ── Final: Export ───────────────────────────────────────────",
        f'output_path = "cleaned_{table_name}.parquet"',
        "df.write_parquet(output_path)",
        f'print(f"Saved {{df.height:,}} rows to {{output_path}}")',
        "",
    ]

    return "\n".join(lines)


def _versions_to_steps(versions: list[dict]) -> list[dict]:
    """Convert version timeline entries to step descriptors."""
    steps = []
    for v in versions:
        op = v.get("operation", "")
        if op in ("load", ""):
            continue
        steps.append({
            "op": op,
            "description": v.get("description", ""),
            "rows_affected": v.get("rowsAffected", 0),
            "label": v.get("label", ""),
        })
    return steps


def _step_to_code(step: dict, step_num: int) -> list[str]:
    """Convert a single step to Python code lines."""
    op = step["op"]
    desc = step["description"]
    rows = step["rows_affected"]
    label = step["label"]

    lines = [
        f"",
        f"# ── Step {step_num}: {label} ─────────────────────────────────",
        f"# {desc}",
    ]

    if op == "deduplicate_exact" or op == "deduplicate":
        lines.append("df = df.unique(maintain_order=True)")

    elif op == "deduplicate_fuzzy":
        lines += [
            "from rapidfuzz import fuzz",
            "# Fuzzy deduplication — finds near-duplicates",
            "str_cols = [c for c in df.columns if df[c].dtype == pl.Utf8]",
            "composite = df.select(pl.concat_str([pl.col(c).fill_null('') for c in str_cols], separator=' | '))['literal'].to_list()",
            "to_remove = set()",
            "for i in range(len(composite)):",
            "    for j in range(i + 1, len(composite)):",
            "        if j not in to_remove and fuzz.ratio(composite[i], composite[j]) >= 85:",
            "            to_remove.add(j)",
            "keep = [i not in to_remove for i in range(df.height)]",
            "df = df.filter(pl.Series(keep))",
        ]

    elif op == "standardize":
        # Try to extract column name from description
        col = _extract_column(desc)
        if col:
            lines.append(f'df = df.with_columns(pl.col("{col}").str.to_lowercase())')
        else:
            lines += [
                "# Standardize string columns",
                "str_cols = [c for c in df.columns if df[c].dtype == pl.Utf8]",
                "for col in str_cols:",
                "    df = df.with_columns(pl.col(col).str.to_lowercase())",
            ]

    elif op == "fix_formats":
        lines += [
            "# Fix whitespace and format issues",
            "str_cols = [c for c in df.columns if df[c].dtype == pl.Utf8]",
            "for col in str_cols:",
            "    df = df.with_columns(pl.col(col).str.strip_chars())",
        ]

    elif op == "fill_nulls":
        lines += [
            "# Fill null values with column mode/mean",
            "for col in df.columns:",
            "    null_count = df[col].null_count()",
            "    if null_count == 0:",
            "        continue",
            "    if df[col].dtype in (pl.Float32, pl.Float64, pl.Int32, pl.Int64):",
            "        fill_val = df[col].mean()",
            "    else:",
            "        mode = df[col].drop_nulls().mode()",
            "        fill_val = mode[0] if mode.len() > 0 else None",
            "    if fill_val is not None:",
            "        df = df.with_columns(pl.col(col).fill_null(pl.lit(fill_val)))",
        ]

    elif op == "fill_nulls_ml":
        lines += [
            "# ML-based null imputation (KNN)",
            "numeric_cols = [c for c in df.columns if df[c].dtype in (pl.Float64, pl.Int64, pl.Float32, pl.Int32)]",
            "if numeric_cols:",
            "    pdf = df.select(numeric_cols).to_pandas()",
            "    imputer = KNNImputer(n_neighbors=5)",
            "    imputed = imputer.fit_transform(pdf)",
            "    for i, col in enumerate(numeric_cols):",
            "        df = df.with_columns(pl.Series(col, imputed[:, i]).cast(df[col].dtype))",
        ]

    elif op == "remove_outliers":
        col = _extract_column(desc)
        if col:
            lines += [
                f'# IQR outlier removal on "{col}"',
                f'q1 = df["{col}"].quantile(0.25)',
                f'q3 = df["{col}"].quantile(0.75)',
                f"iqr = q3 - q1",
                f'df = df.filter(',
                f'    pl.col("{col}").is_null() | ',
                f'    ((pl.col("{col}") >= q1 - 1.5 * iqr) & (pl.col("{col}") <= q3 + 1.5 * iqr))',
                f')',
            ]
        else:
            lines.append("# Remove outliers (configure column and method as needed)")

    elif op == "drop_columns":
        col = _extract_column(desc)
        if col:
            lines.append(f'df = df.drop(["{col}"])')
        else:
            lines.append("# df = df.drop(['column_name'])  # Configure as needed")

    elif op == "rename_column":
        # Try to extract from/to from description: "Renamed 'old' -> 'new'."
        import re
        match = re.search(r"'(.+?)'\s*->\s*'(.+?)'", desc)
        if match:
            old, new = match.group(1), match.group(2)
            lines.append(f'df = df.rename({{"{old}": "{new}"}})')
        else:
            lines.append("# df = df.rename({'old_name': 'new_name'})  # Configure as needed")

    elif op == "filter_rows":
        import re
        match = re.search(r'Filtered: .+? condition: (.+)', desc)
        if match:
            cond = match.group(1)
            lines.append(f'# Filter: {cond}')
        lines.append("# df = df.filter(pl.col('column') > value)  # Configure as needed")

    else:
        lines += [
            f"# Operation: {op}",
            "# (configure manually as needed)",
        ]

    if rows > 0:
        lines.append(f'print(f"Step {step_num} done — {rows:,} rows affected. Remaining: {{df.height:,}}")')

    return lines


def _extract_column(description: str) -> Optional[str]:
    """Try to extract a column name from a step description string."""
    import re
    # Match patterns like: "column 'city'" or "'city': ..."  or "on 'city'"
    for pattern in [r"'(.+?)'", r'"(.+?)"']:
        m = re.search(pattern, description)
        if m:
            return m.group(1)
    return None
