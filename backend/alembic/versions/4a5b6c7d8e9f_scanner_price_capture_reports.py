"""scanner price capture and moderated barcode reports

Revision ID: 4a5b6c7d8e9f
Revises: 12e3f4a5b6c7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4a5b6c7d8e9f"
down_revision: Union[str, None] = "12e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shopping_list_items", sa.Column("captured_store_product_id", sa.Integer(), nullable=True))
    op.add_column("shopping_list_items", sa.Column("captured_store_branch_id", sa.Integer(), nullable=True))
    op.add_column("shopping_list_items", sa.Column("captured_unit_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("shopping_list_items", sa.Column("price_captured_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_sli_captured_store_product", "shopping_list_items", "store_products", ["captured_store_product_id"], ["id"])
    op.create_foreign_key("fk_sli_captured_store_branch", "shopping_list_items", "store_branches", ["captured_store_branch_id"], ["id"])
    op.create_index("ix_sli_captured_store_product", "shopping_list_items", ["captured_store_product_id"])
    op.create_index("ix_sli_captured_store_branch", "shopping_list_items", ["captured_store_branch_id"])
    op.create_unique_constraint("uq_shopping_list_items_list_product", "shopping_list_items", ["shopping_list_id", "product_id"])

    op.add_column("reports", sa.Column("barcode_id", sa.Integer(), nullable=True))
    op.add_column("reports", sa.Column("correction_kind", sa.String(length=32), nullable=True))
    op.create_foreign_key("fk_reports_barcode", "reports", "product_barcodes", ["barcode_id"], ["id"])
    op.create_index("ix_reports_barcode", "reports", ["barcode_id"])
    op.create_index("ix_reports_correction_kind", "reports", ["correction_kind"])


def downgrade() -> None:
    op.drop_index("ix_reports_correction_kind", table_name="reports")
    op.drop_index("ix_reports_barcode", table_name="reports")
    op.drop_constraint("fk_reports_barcode", "reports", type_="foreignkey")
    op.drop_column("reports", "correction_kind")
    op.drop_column("reports", "barcode_id")
    op.drop_constraint("uq_shopping_list_items_list_product", "shopping_list_items", type_="unique")
    op.drop_index("ix_sli_captured_store_branch", table_name="shopping_list_items")
    op.drop_index("ix_sli_captured_store_product", table_name="shopping_list_items")
    op.drop_constraint("fk_sli_captured_store_branch", "shopping_list_items", type_="foreignkey")
    op.drop_constraint("fk_sli_captured_store_product", "shopping_list_items", type_="foreignkey")
    op.drop_column("shopping_list_items", "price_captured_at")
    op.drop_column("shopping_list_items", "captured_unit_price")
    op.drop_column("shopping_list_items", "captured_store_branch_id")
    op.drop_column("shopping_list_items", "captured_store_product_id")
