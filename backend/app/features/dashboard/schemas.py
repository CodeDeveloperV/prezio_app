from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class MonthlySummary(BaseModel):
    year: int
    month: int
    total_spent: Decimal
    total_savings: Decimal


class MostPurchasedProduct(BaseModel):
    product_id: int
    product_name: str
    total_quantity: int


class LastPurchase(BaseModel):
    item_id: int
    product_id: int
    product_name: str
    quantity: int
    price_at_check: Decimal
    checked_at: datetime


class DashboardSummary(BaseModel):
    current_month: MonthlySummary
    previous_month: MonthlySummary
    # Oldest first, current month last -- ready to plot as-is.
    monthly_history: list[MonthlySummary]
    most_purchased_products: list[MostPurchasedProduct]
    last_purchase: LastPurchase | None
    monthly_budget: Decimal | None
    remaining_budget: Decimal | None
