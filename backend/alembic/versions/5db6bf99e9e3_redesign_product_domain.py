"""redesign product domain: brands, product barcodes, product aliases, pricing fields

Revision ID: 5db6bf99e9e3
Revises: 01cc5a6bc8ec
Create Date: 2026-08-11 00:00:00.000000

Splits the old single-barcode `products.barcode` design into separate identity
(Product), barcode (ProductBarcode, many-per-product), and alias (ProductAlias)
concepts -- a barcode never uniquely identifies a product across PA/LATAM
supermarkets, so it can no longer live on `products` itself. Also enriches
`store_products`/`price_history` with currency/availability/verification and a
previous/new price pair.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5db6bf99e9e3'
down_revision: Union[str, None] = '01cc5a6bc8ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- brands -----------------------------------------------------------
    op.create_table(
        'brands',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_brands_name'), 'brands', ['name'], unique=False)

    # --- products: rename/add identity columns, drop the single barcode ---
    op.alter_column('products', 'name', new_column_name='canonical_name')
    op.add_column('products', sa.Column('brand_id', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('presentation', sa.String(length=64), nullable=True))
    op.add_column('products', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('image_url', sa.String(length=500), nullable=True))
    op.add_column(
        'products',
        sa.Column('recognition_type', sa.String(length=20), nullable=False, server_default='manual'),
    )
    op.add_column(
        'products',
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending_review'),
    )
    op.add_column('products', sa.Column('created_by', sa.Integer(), nullable=True))
    op.add_column(
        'products',
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.add_column(
        'products',
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_foreign_key('fk_products_brand_id_brands', 'products', 'brands', ['brand_id'], ['id'])
    op.create_foreign_key('fk_products_created_by_users', 'products', 'users', ['created_by'], ['id'])
    op.create_index(op.f('ix_products_canonical_name'), 'products', ['canonical_name'], unique=False)
    op.create_index(op.f('ix_products_brand_id'), 'products', ['brand_id'], unique=False)
    op.create_index(op.f('ix_products_category_id'), 'products', ['category_id'], unique=False)
    op.drop_index(op.f('ix_products_name'), table_name='products')
    op.drop_column('products', 'barcode')
    op.drop_column('products', 'unit')

    # --- product_barcodes: every known barcode for a product ---------------
    op.create_table(
        'product_barcodes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('barcode', sa.String(length=64), nullable=False),
        sa.Column('barcode_type', sa.String(length=20), nullable=False, server_default='other'),
        sa.Column('store_id', sa.Integer(), nullable=True),
        sa.Column('country', sa.String(length=2), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='user_scan'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('verified', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('barcode', 'store_id', name='uq_product_barcodes_barcode_store'),
    )
    op.create_index(op.f('ix_product_barcodes_product_id'), 'product_barcodes', ['product_id'], unique=False)
    op.create_index(op.f('ix_product_barcodes_barcode'), 'product_barcodes', ['barcode'], unique=False)
    op.create_index(op.f('ix_product_barcodes_store_id'), 'product_barcodes', ['store_id'], unique=False)

    # --- product_aliases: user-submitted alternate names --------------------
    op.create_table(
        'product_aliases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('alias', sa.String(length=255), nullable=False),
        sa.Column('language', sa.String(length=5), nullable=False, server_default='es'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('product_id', 'alias', 'language', name='uq_product_aliases_product_alias_language'),
    )
    op.create_index(op.f('ix_product_aliases_product_id'), 'product_aliases', ['product_id'], unique=False)
    op.create_index(op.f('ix_product_aliases_alias'), 'product_aliases', ['alias'], unique=False)

    # --- store_products: current_price/currency/availability/verification --
    op.alter_column('store_products', 'price', new_column_name='current_price')
    op.add_column(
        'store_products', sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD')
    )
    op.add_column(
        'store_products',
        sa.Column('availability', sa.String(length=20), nullable=False, server_default='unknown'),
    )
    op.add_column(
        'store_products', sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('store_products', sa.Column('last_verified_by', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_store_products_last_verified_by_users', 'store_products', 'users', ['last_verified_by'], ['id']
    )
    op.create_unique_constraint(
        'uq_store_products_branch_product', 'store_products', ['store_branch_id', 'product_id']
    )

    # --- price_history: previous_price/new_price/updated_by/updated_at -----
    op.alter_column('price_history', 'price', new_column_name='new_price')
    op.alter_column('price_history', 'changed_by', new_column_name='updated_by')
    op.alter_column('price_history', 'changed_at', new_column_name='updated_at')
    op.add_column('price_history', sa.Column('previous_price', sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('price_history', 'previous_price')
    op.alter_column('price_history', 'updated_at', new_column_name='changed_at')
    op.alter_column('price_history', 'updated_by', new_column_name='changed_by')
    op.alter_column('price_history', 'new_price', new_column_name='price')

    op.drop_constraint('uq_store_products_branch_product', 'store_products', type_='unique')
    op.drop_constraint('fk_store_products_last_verified_by_users', 'store_products', type_='foreignkey')
    op.drop_column('store_products', 'last_verified_by')
    op.drop_column('store_products', 'last_verified_at')
    op.drop_column('store_products', 'availability')
    op.drop_column('store_products', 'currency')
    op.alter_column('store_products', 'current_price', new_column_name='price')

    op.drop_index(op.f('ix_product_aliases_alias'), table_name='product_aliases')
    op.drop_index(op.f('ix_product_aliases_product_id'), table_name='product_aliases')
    op.drop_table('product_aliases')

    op.drop_index(op.f('ix_product_barcodes_store_id'), table_name='product_barcodes')
    op.drop_index(op.f('ix_product_barcodes_barcode'), table_name='product_barcodes')
    op.drop_index(op.f('ix_product_barcodes_product_id'), table_name='product_barcodes')
    op.drop_table('product_barcodes')

    op.add_column('products', sa.Column('unit', sa.String(length=32), nullable=False, server_default='unit'))
    op.add_column('products', sa.Column('barcode', sa.String(length=64), nullable=True))
    op.create_unique_constraint('uq_products_barcode', 'products', ['barcode'])
    op.create_index(op.f('ix_products_name'), 'products', ['canonical_name'], unique=False)
    op.drop_index(op.f('ix_products_category_id'), table_name='products')
    op.drop_index(op.f('ix_products_brand_id'), table_name='products')
    op.drop_index(op.f('ix_products_canonical_name'), table_name='products')
    op.drop_constraint('fk_products_created_by_users', 'products', type_='foreignkey')
    op.drop_constraint('fk_products_brand_id_brands', 'products', type_='foreignkey')
    op.drop_column('products', 'updated_at')
    op.drop_column('products', 'created_at')
    op.drop_column('products', 'created_by')
    op.drop_column('products', 'status')
    op.drop_column('products', 'recognition_type')
    op.drop_column('products', 'image_url')
    op.drop_column('products', 'description')
    op.drop_column('products', 'presentation')
    op.drop_column('products', 'brand_id')
    op.alter_column('products', 'canonical_name', new_column_name='name')

    op.drop_index(op.f('ix_brands_name'), table_name='brands')
    op.drop_table('brands')
