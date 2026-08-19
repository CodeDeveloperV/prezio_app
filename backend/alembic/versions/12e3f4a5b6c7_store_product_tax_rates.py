"""store product tax rates

Revision ID: 12e3f4a5b6c7
Revises: 11d1d1c2bb8d
Create Date: 2026-08-18 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "12e3f4a5b6c7"
down_revision: Union[str, None] = "11d1d1c2bb8d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tax_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("rate", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("country", "code", name="uq_tax_rates_country_code"),
    )
    op.create_index(op.f("ix_tax_rates_country"), "tax_rates", ["country"], unique=False)
    op.add_column("store_products", sa.Column("tax_rate_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_store_products_tax_rate_id", "store_products", "tax_rates", ["tax_rate_id"], ["id"])
    op.create_index(op.f("ix_store_products_tax_rate_id"), "store_products", ["tax_rate_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_store_products_tax_rate_id"), table_name="store_products")
    op.drop_constraint("fk_store_products_tax_rate_id", "store_products", type_="foreignkey")
    op.drop_column("store_products", "tax_rate_id")
    op.drop_index(op.f("ix_tax_rates_country"), table_name="tax_rates")
    op.drop_table("tax_rates")
