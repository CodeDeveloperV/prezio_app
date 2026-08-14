"""organization members and branch access

Revision ID: 55182a2f840a
Revises: b6c7d8e9f0a1
Create Date: 2026-08-14 13:26:42.573723

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55182a2f840a'
down_revision: Union[str, None] = 'b6c7d8e9f0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('organization_members',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('role', sa.Enum('ORGANIZATION_ADMIN', 'MANAGER', 'EMPLOYEE', name='organizationrole', native_enum=False), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', name='organizationmemberstatus', native_enum=False), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('store_id', 'user_id', name='uq_organization_members_store_user')
    )
    op.create_index(op.f('ix_organization_members_store_id'), 'organization_members', ['store_id'], unique=False)
    op.create_index(op.f('ix_organization_members_user_id'), 'organization_members', ['user_id'], unique=False)
    op.create_table('organization_member_branches',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_member_id', sa.Integer(), nullable=False),
    sa.Column('store_branch_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['organization_member_id'], ['organization_members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['store_branch_id'], ['store_branches.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_member_id', 'store_branch_id', name='uq_org_member_branches')
    )
    op.create_index(op.f('ix_organization_member_branches_organization_member_id'), 'organization_member_branches', ['organization_member_id'], unique=False)
    op.create_index(op.f('ix_organization_member_branches_store_branch_id'), 'organization_member_branches', ['store_branch_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_organization_member_branches_store_branch_id'), table_name='organization_member_branches')
    op.drop_index(op.f('ix_organization_member_branches_organization_member_id'), table_name='organization_member_branches')
    op.drop_table('organization_member_branches')
    op.drop_index(op.f('ix_organization_members_user_id'), table_name='organization_members')
    op.drop_index(op.f('ix_organization_members_store_id'), table_name='organization_members')
    op.drop_table('organization_members')
