"""collaborative moderation system: uniform status on products/barcodes/aliases, product_merges

Revision ID: 9a7d1c7f1ea6
Revises: 5db6bf99e9e3
Create Date: 2026-08-12 00:00:00.000000

Introduces a single PENDING/APPROVED/REJECTED/MERGED vocabulary (`app.shared.enums.
ModerationStatus`) shared by products, product_barcodes, product_aliases and the new
product_merges table, replacing the ad-hoc `products.status` vocabulary and
`product_barcodes.verified` boolean. Adds `users.is_moderator` for moderator-only actions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a7d1c7f1ea6'
down_revision: Union[str, None] = '5db6bf99e9e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users: moderator flag ---------------------------------------------
    op.add_column('users', sa.Column('is_moderator', sa.Boolean(), nullable=False, server_default=sa.false()))

    # --- products: reviewed_by/reviewed_at + status vocabulary migration ---
    op.add_column('products', sa.Column('reviewed_by', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key('fk_products_reviewed_by_users', 'products', 'users', ['reviewed_by'], ['id'])

    # active/discontinued were both "usable" states under the old vocabulary; approving them on
    # migration is a safer default than rejecting, since they were never flagged as invalid.
    op.execute("UPDATE products SET status = 'approved' WHERE status IN ('active', 'discontinued')")
    op.execute("UPDATE products SET status = 'pending' WHERE status = 'pending_review'")
    op.alter_column('products', 'status', server_default='pending')

    # --- product_barcodes: verified (bool) -> status/reviewed_by/reviewed_at
    op.add_column(
        'product_barcodes',
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
    )
    op.execute("UPDATE product_barcodes SET status = 'approved' WHERE verified = true")
    op.add_column('product_barcodes', sa.Column('reviewed_by', sa.Integer(), nullable=True))
    op.add_column('product_barcodes', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_product_barcodes_reviewed_by_users', 'product_barcodes', 'users', ['reviewed_by'], ['id']
    )
    op.drop_column('product_barcodes', 'verified')

    # --- product_aliases: add status/reviewed_by/reviewed_at ----------------
    op.add_column(
        'product_aliases',
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
    )
    op.add_column('product_aliases', sa.Column('reviewed_by', sa.Integer(), nullable=True))
    op.add_column('product_aliases', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_product_aliases_reviewed_by_users', 'product_aliases', 'users', ['reviewed_by'], ['id']
    )

    # --- product_merges: duplicate-product merge proposals ------------------
    op.create_table(
        'product_merges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_product_id', sa.Integer(), nullable=False),
        sa.Column('target_product_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('proposed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['source_product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['target_product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['proposed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('source_product_id <> target_product_id', name='ck_product_merges_distinct_products'),
    )
    op.create_index(op.f('ix_product_merges_source_product_id'), 'product_merges', ['source_product_id'], unique=False)
    op.create_index(op.f('ix_product_merges_target_product_id'), 'product_merges', ['target_product_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_product_merges_target_product_id'), table_name='product_merges')
    op.drop_index(op.f('ix_product_merges_source_product_id'), table_name='product_merges')
    op.drop_table('product_merges')

    op.drop_constraint('fk_product_aliases_reviewed_by_users', 'product_aliases', type_='foreignkey')
    op.drop_column('product_aliases', 'reviewed_at')
    op.drop_column('product_aliases', 'reviewed_by')
    op.drop_column('product_aliases', 'status')

    op.add_column('product_barcodes', sa.Column('verified', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE product_barcodes SET verified = true WHERE status = 'approved'")
    op.drop_constraint('fk_product_barcodes_reviewed_by_users', 'product_barcodes', type_='foreignkey')
    op.drop_column('product_barcodes', 'reviewed_at')
    op.drop_column('product_barcodes', 'reviewed_by')
    op.drop_column('product_barcodes', 'status')

    # rejected/merged have no equivalent in the old vocabulary; pending_review is the closest
    # safe fallback (an item that needs another look), same tradeoff as the boolean it replaces.
    op.execute("UPDATE products SET status = 'pending_review' WHERE status IN ('pending', 'rejected')")
    op.execute("UPDATE products SET status = 'active' WHERE status = 'approved'")
    op.alter_column('products', 'status', server_default='pending_review')
    op.drop_constraint('fk_products_reviewed_by_users', 'products', type_='foreignkey')
    op.drop_column('products', 'reviewed_at')
    op.drop_column('products', 'reviewed_by')

    op.drop_column('users', 'is_moderator')
