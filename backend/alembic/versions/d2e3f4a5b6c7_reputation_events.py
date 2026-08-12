"""collaborator reputation: reputation_events table

Revision ID: d2e3f4a5b6c7
Revises: c1a2b3d4e5f6
Create Date: 2026-08-12 00:00:00.000002

Append-only ledger of every point-earning action (confirming a price, updating a price
correctly, a created product getting approved, a proposed duplicate merge getting approved).
A user's total reputation and level are always summed on read from this table -- no
denormalized counter is kept, mirroring price_confirmations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reputation_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('reference_type', sa.String(length=32), nullable=False),
        sa.Column('reference_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reputation_events_user_id'), 'reputation_events', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_reputation_events_user_id'), table_name='reputation_events')
    op.drop_table('reputation_events')
