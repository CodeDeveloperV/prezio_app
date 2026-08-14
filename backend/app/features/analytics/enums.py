from enum import Enum


class AnalyticsPeriod(str, Enum):
    """Rolling window applied to every metric except personal inflation, which has its own
    independent `inflation_window_months` parameter (see AnalyticsService._personal_inflation)."""

    LAST_30_DAYS = "30d"
    LAST_3_MONTHS = "3m"
    LAST_6_MONTHS = "6m"
    LAST_12_MONTHS = "12m"
    ALL = "all"
