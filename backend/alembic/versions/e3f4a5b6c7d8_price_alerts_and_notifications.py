"""price alerts and notifications: price_alerts, notifications tables

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-12 00:00:00.000003

price_alerts holds re-armable "notify me when X drops below $Y" thresholds; notifications is a
generic in-app inbox (not price-alert-specific) that price_alerts is one producer of, via the
nullable alert_id FK -- hence price_alerts is created first.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'price_alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=True),
        sa.Column('store_branch_id', sa.Integer(), nullable=True),
        sa.Column('target_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_below_threshold', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.ForeignKeyConstraint(['store_branch_id'], ['store_branches.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_price_alerts_user_id'), 'price_alerts', ['user_id'], unique=False)
    op.create_index(op.f('ix_price_alerts_product_id'), 'price_alerts', ['product_id'], unique=False)
    op.create_index(op.f('ix_price_alerts_store_id'), 'price_alerts', ['store_id'], unique=False)
    op.create_index(op.f('ix_price_alerts_store_branch_id'), 'price_alerts', ['store_branch_id'], unique=False)

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('related_entity_type', sa.String(length=64), nullable=True),
        sa.Column('related_entity_id', sa.Integer(), nullable=True),
        sa.Column('alert_id', sa.Integer(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['alert_id'], ['price_alerts.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_notifications_alert_id'), 'notifications', ['alert_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notifications_alert_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')

    op.drop_index(op.f('ix_price_alerts_store_branch_id'), table_name='price_alerts')
    op.drop_index(op.f('ix_price_alerts_store_id'), table_name='price_alerts')
    op.drop_index(op.f('ix_price_alerts_product_id'), table_name='price_alerts')
    op.drop_index(op.f('ix_price_alerts_user_id'), table_name='price_alerts')
    op.drop_table('price_alerts')
