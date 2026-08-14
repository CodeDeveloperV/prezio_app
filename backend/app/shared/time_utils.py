from datetime import datetime, timezone


def as_aware_utc(value: datetime) -> datetime:
    """SQLite (used in tests) drops tzinfo on round-trip even for `DateTime(timezone=True)`
    columns; Postgres in production does not. Shared by dashboard/analytics/alerts so every
    consumer of a persisted timestamp normalizes it the same way before comparing/bucketing."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def month_start(dt: datetime, offset: int = 0) -> datetime:
    year = dt.year
    month = dt.month + offset
    year += (month - 1) // 12
    month = (month - 1) % 12 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)
