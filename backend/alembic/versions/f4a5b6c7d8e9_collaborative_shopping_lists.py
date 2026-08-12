"""collaborative shopping lists (Epic 8): membership, invitations, item versioning

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-12 00:00:00.000004

Adds shopping_list_members (roles: owner/editor, stored as plain varchar so a future VIEWER
role needs no migration), shopping_list_invitations (email-only invites to existing users), a
`status` column on shopping_lists (active/archived), and optimistic-concurrency `version` +
idempotency `client_request_id` columns on shopping_list_items.

Existing shopping_lists predate the membership table, so every current list's owner is
backfilled as an `owner` row in shopping_list_members -- no pre-existing list is left without
membership.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_lists',
        sa.Column('status', sa.String(length=32), nullable=False, server_default='active'),
    )
    op.add_column(
        'shopping_list_items',
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
    )
    op.add_column(
        'shopping_list_items',
        sa.Column('client_request_id', sa.String(length=64), nullable=True),
    )

    op.create_table(
        'shopping_list_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shopping_list_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['shopping_list_id'], ['shopping_lists.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('shopping_list_id', 'user_id', name='uq_shopping_list_members_list_user'),
    )
    op.create_index(
        op.f('ix_shopping_list_members_shopping_list_id'), 'shopping_list_members', ['shopping_list_id'], unique=False
    )
    op.create_index(op.f('ix_shopping_list_members_user_id'), 'shopping_list_members', ['user_id'], unique=False)

    op.create_table(
        'shopping_list_invitations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shopping_list_id', sa.Integer(), nullable=False),
        sa.Column('invited_email', sa.String(length=255), nullable=False),
        sa.Column('invited_user_id', sa.Integer(), nullable=True),
        sa.Column('invited_by_user_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['shopping_list_id'], ['shopping_lists.id']),
        sa.ForeignKeyConstraint(['invited_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['invited_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_shopping_list_invitations_shopping_list_id'),
        'shopping_list_invitations',
        ['shopping_list_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_shopping_list_invitations_invited_email'), 'shopping_list_invitations', ['invited_email'], unique=False
    )
    op.create_index(
        op.f('ix_shopping_list_invitations_invited_user_id'),
        'shopping_list_invitations',
        ['invited_user_id'],
        unique=False,
    )

    # Backfill: every pre-existing shopping list's current owner becomes its `owner` member row,
    # so no list created before this migration is left without membership.
    op.execute(
        """
        INSERT INTO shopping_list_members (shopping_list_id, user_id, role, joined_at)
        SELECT id, owner_user_id, 'owner', created_at FROM shopping_lists
        """
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_shopping_list_invitations_invited_user_id'), table_name='shopping_list_invitations')
    op.drop_index(op.f('ix_shopping_list_invitations_invited_email'), table_name='shopping_list_invitations')
    op.drop_index(op.f('ix_shopping_list_invitations_shopping_list_id'), table_name='shopping_list_invitations')
    op.drop_table('shopping_list_invitations')

    op.drop_index(op.f('ix_shopping_list_members_user_id'), table_name='shopping_list_members')
    op.drop_index(op.f('ix_shopping_list_members_shopping_list_id'), table_name='shopping_list_members')
    op.drop_table('shopping_list_members')

    op.drop_column('shopping_list_items', 'client_request_id')
    op.drop_column('shopping_list_items', 'version')
    op.drop_column('shopping_lists', 'status')
