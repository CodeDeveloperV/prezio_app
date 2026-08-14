"""store attribution for purchases (Epic 13: personal analytics)

Revision ID: b6c7d8e9f0a1
Revises: 7259fb0743dc
Create Date: 2026-08-13 00:00:00.000001

Adds `active_store_branch_id` to shopping_lists (the branch currently selected for that
shopping session/trip -- nullable, no shopping list has one selected by default) and
`store_branch_id` to shopping_list_items (a snapshot of the list's active branch at the
exact moment the item was checked, copied once and never recalculated if the list's active
branch changes later). Both nullable and unbackfilled: no historical checked item can be
retroactively attributed to a branch without inventing data (see backend/app/features/
shopping_lists/service.py `_price_at_branch`), so pre-migration purchases simply have
`store_branch_id = NULL` and are reported as "unattributed" by analytics.

Also adds indexes on shopping_list_items.checked/checked_at/store_branch_id -- all read by
the new analytics feature's aggregation queries and previously unindexed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6c7d8e9f0a1'
down_revision: Union[str, None] = '7259fb0743dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_lists',
        sa.Column('active_store_branch_id', sa.Integer(), sa.ForeignKey('store_branches.id'), nullable=True),
    )
    op.create_index(
        'ix_shopping_lists_active_store_branch_id', 'shopping_lists', ['active_store_branch_id']
    )

    op.add_column(
        'shopping_list_items',
        sa.Column('store_branch_id', sa.Integer(), sa.ForeignKey('store_branches.id'), nullable=True),
    )
    op.create_index('ix_shopping_list_items_store_branch_id', 'shopping_list_items', ['store_branch_id'])
    op.create_index('ix_shopping_list_items_checked', 'shopping_list_items', ['checked'])
    op.create_index('ix_shopping_list_items_checked_at', 'shopping_list_items', ['checked_at'])


def downgrade() -> None:
    op.drop_index('ix_shopping_list_items_checked_at', table_name='shopping_list_items')
    op.drop_index('ix_shopping_list_items_checked', table_name='shopping_list_items')
    op.drop_index('ix_shopping_list_items_store_branch_id', table_name='shopping_list_items')
    op.drop_column('shopping_list_items', 'store_branch_id')

    op.drop_index('ix_shopping_lists_active_store_branch_id', table_name='shopping_lists')
    op.drop_column('shopping_lists', 'active_store_branch_id')
