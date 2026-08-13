"""dashboard analytics (Epic 9): purchase snapshot + monthly budget

Revision ID: a1b2c3d4e5f6
Revises: f4a5b6c7d8e9
Create Date: 2026-08-12 00:00:00.000005

Adds `checked_at` + `price_at_check` to shopping_list_items, captured atomically the moment an
item transitions to checked (treated as this item's "purchase" signal, since Prezio has no
separate purchase/order domain). Adds `monthly_budget` to user_profiles for the dashboard's
"presupuesto restante". Both are nullable additive columns; no backfill needed since no purchase
history predates this migration and no user_profiles rows are created anywhere yet.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_list_items',
        sa.Column('checked_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'shopping_list_items',
        sa.Column('price_at_check', sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        'user_profiles',
        sa.Column('monthly_budget', sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('user_profiles', 'monthly_budget')
    op.drop_column('shopping_list_items', 'price_at_check')
    op.drop_column('shopping_list_items', 'checked_at')
