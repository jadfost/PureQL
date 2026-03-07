"""Semantic deduplication — finds near-duplicates using embedding similarity.

Uses sentence-transformers (MiniLM) to embed text rows and remove semantically
similar entries. Falls back to fuzzy matching if sentence-transformers is not
installed.
"""

from __future__ import annotations

from typing import Optional
import polars as pl


MODEL_NAME = "all-MiniLM-L6-v2"
DEFAULT_THRESHOLD = 0.92  # cosine similarity threshold


def deduplicate_semantic(
    df: pl.DataFrame,
    subset: Optional[list[str]] = None,
    threshold: float = DEFAULT_THRESHOLD,
    batch_size: int = 256,
) -> tuple[pl.DataFrame, dict]:
    """Remove semantically duplicate rows using sentence embeddings.

    Args:
        df: Input DataFrame.
        subset: Columns to use for comparison. Defaults to all string columns.
        threshold: Cosine similarity threshold (0.0–1.0). Higher = stricter.
        batch_size: Batch size for encoding (reduce if OOM).

    Returns:
        Tuple of (deduplicated DataFrame, stats dict).
    """
    # Select string columns for comparison
    if subset is None:
        subset = [c for c in df.columns if df[c].dtype == pl.Utf8]

    if not subset:
        return df, {"removed": 0, "strategy": "semantic", "reason": "no_text_columns"}

    # Build composite text for each row
    composite = _build_composite(df, subset)

    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np

        model = SentenceTransformer(MODEL_NAME)
        embeddings = model.encode(
            composite,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,  # Normalize for cosine similarity via dot product
        )

        to_remove = _find_duplicates_cosine(embeddings, threshold)

    except ImportError:
        # Fallback to rapidfuzz if sentence-transformers not available
        to_remove = _fallback_fuzzy(composite, threshold)

    # Filter out duplicate rows
    keep_mask = [i not in to_remove for i in range(df.height)]
    cleaned = df.filter(pl.Series(keep_mask))
    removed = len(to_remove)

    return cleaned, {
        "removed": removed,
        "original_rows": df.height,
        "remaining_rows": cleaned.height,
        "strategy": "semantic",
        "threshold": threshold,
        "columns_used": subset,
    }


def _build_composite(df: pl.DataFrame, columns: list[str]) -> list[str]:
    """Build a single string per row from multiple columns."""
    composite_expr = pl.concat_str(
        [pl.col(c).cast(pl.Utf8).fill_null("") for c in columns],
        separator=" | ",
    ).alias("__composite__")

    return df.select(composite_expr)["__composite__"].to_list()


def _find_duplicates_cosine(embeddings, threshold: float) -> set[int]:
    """Find duplicate indices using cosine similarity (embeddings must be normalized)."""
    import numpy as np

    to_remove: set[int] = set()
    n = len(embeddings)

    # Process in chunks to avoid OOM on large datasets
    chunk_size = 512
    for start in range(0, n, chunk_size):
        end = min(start + chunk_size, n)
        chunk = embeddings[start:end]

        # Similarity of this chunk against all rows (dot product of normalized = cosine)
        sims = chunk @ embeddings.T  # shape: (chunk_size, n)

        for local_i, global_i in enumerate(range(start, end)):
            if global_i in to_remove:
                continue
            row_sims = sims[local_i]
            # Find all rows that are highly similar to this one (but only later rows)
            for j in range(global_i + 1, n):
                if j in to_remove:
                    continue
                if row_sims[j] >= threshold:
                    to_remove.add(j)

    return to_remove


def _fallback_fuzzy(composite: list[str], threshold: float) -> set[int]:
    """Fallback dedup using rapidfuzz when sentence-transformers is unavailable."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        return set()

    to_remove: set[int] = set()
    fuzzy_threshold = threshold * 100  # rapidfuzz uses 0-100 scale

    for i in range(len(composite)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(composite)):
            if j in to_remove:
                continue
            if fuzz.ratio(composite[i], composite[j]) >= fuzzy_threshold:
                to_remove.add(j)

    return to_remove
