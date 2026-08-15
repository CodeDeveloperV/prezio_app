"""reports

Revision ID: 11d1d1c2bb8d
Revises: fe1b7ea48087
Create Date: 2026-08-15 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11d1d1c2bb8d'
down_revision: Union[str, None] = 'fe1b7ea48087'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=True),
    sa.Column('type', sa.Enum('INCORRECT_PRODUCT_INFO', 'INCORRECT_BARCODE', 'DUPLICATE_PRODUCT', 'INCORRECT_PRICE', 'INCORRECT_AVAILABILITY', 'PRODUCT_NOT_SOLD_HERE', 'OTHER', name='reporttype', native_enum=False), nullable=False),
    sa.Column('status', sa.Enum('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED', name='reportstatus', native_enum=False), nullable=False),
    sa.Column('priority', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='reportpriority', native_enum=False), nullable=False),
    sa.Column('reporter_user_id', sa.Integer(), nullable=False),
    sa.Column('product_id', sa.Integer(), nullable=True),
    sa.Column('store_product_id', sa.Integer(), nullable=True),
    sa.Column('store_branch_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('reported_value', sa.JSON(), nullable=True),
    sa.Column('current_value_snapshot', sa.JSON(), nullable=True),
    sa.Column('assigned_to_user_id', sa.Integer(), nullable=True),
    sa.Column('resolution_type', sa.Enum('DATA_CORRECTED', 'PRICE_UPDATED', 'AVAILABILITY_UPDATED', 'LISTING_DISABLED', 'ESCALATED_TO_CATALOG_MODERATION', 'NO_ISSUE_FOUND', 'DUPLICATE_CONFIRMED', 'OTHER', name='reportresolutiontype', native_enum=False), nullable=True),
    sa.Column('resolution_note', sa.Text(), nullable=True),
    sa.Column('resolved_by', sa.Integer(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('dismissed_by', sa.Integer(), nullable=True),
    sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['dismissed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['reporter_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['store_branch_id'], ['store_branches.id'], ),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['store_product_id'], ['store_products.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reports_created_at'), 'reports', ['created_at'], unique=False)
    op.create_index(op.f('ix_reports_product_id'), 'reports', ['product_id'], unique=False)
    op.create_index(op.f('ix_reports_reporter_user_id'), 'reports', ['reporter_user_id'], unique=False)
    op.create_index(op.f('ix_reports_status'), 'reports', ['status'], unique=False)
    op.create_index(op.f('ix_reports_store_branch_id'), 'reports', ['store_branch_id'], unique=False)
    op.create_index(op.f('ix_reports_store_id'), 'reports', ['store_id'], unique=False)
    op.create_index(op.f('ix_reports_store_product_id'), 'reports', ['store_product_id'], unique=False)
    op.create_index(op.f('ix_reports_type'), 'reports', ['type'], unique=False)
    op.create_table('report_activity',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('report_id', sa.Integer(), nullable=False),
    sa.Column('actor_user_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=50), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_report_activity_report_id'), 'report_activity', ['report_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_report_activity_report_id'), table_name='report_activity')
    op.drop_table('report_activity')
    op.drop_index(op.f('ix_reports_type'), table_name='reports')
    op.drop_index(op.f('ix_reports_store_product_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_store_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_store_branch_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_status'), table_name='reports')
    op.drop_index(op.f('ix_reports_reporter_user_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_product_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_created_at'), table_name='reports')
    op.drop_table('reports')
