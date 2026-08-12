"""collaborative price confirmation: price_confirmations table

Revision ID: c1a2b3d4e5f6
Revises: 9a7d1c7f1ea6
Create Date: 2026-08-12 00:00:00.000001

Every "✓ Coincide" now writes a row recording who confirmed a StoreProduct's price, at which
branch, when, and at what price. The reputation system reads this table directly (a simple count
of confirmations per user) rather than a denormalized counter.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = '9a7d1c7f1ea6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'price_confirmations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_product_id', sa.Integer(), nullable=False),
        sa.Column('store_branch_id', sa.Integer(), nullable=False),
        sa.Column('confirmed_by', sa.Integer(), nullable=False),
        sa.Column('confirmed_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['store_product_id'], ['store_products.id']),
        sa.ForeignKeyConstraint(['store_branch_id'], ['store_branches.id']),
        sa.ForeignKeyConstraint(['confirmed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_price_confirmations_store_product_id'), 'price_confirmations', ['store_product_id'], unique=False)
    op.create_index(op.f('ix_price_confirmations_store_branch_id'), 'price_confirmations', ['store_branch_id'], unique=False)
    op.create_index(op.f('ix_price_confirmations_confirmed_by'), 'price_confirmations', ['confirmed_by'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_price_confirmations_confirmed_by'), table_name='price_confirmations')
    op.drop_index(op.f('ix_price_confirmations_store_branch_id'), table_name='price_confirmations')
    op.drop_index(op.f('ix_price_confirmations_store_product_id'), table_name='price_confirmations')
    op.drop_table('price_confirmations')
