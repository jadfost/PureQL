"""PureQL Core — Data cleaning + SQL optimization engine."""

__version__ = "0.1.0"

from pureql.ingestion.loader import load
from pureql.profiling.profiler import profile

__all__ = ["load", "profile"]
