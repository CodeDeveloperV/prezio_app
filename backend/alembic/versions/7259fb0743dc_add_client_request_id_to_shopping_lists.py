"""add_client_request_id_to_shopping_lists

Revision ID: 7259fb0743dc
Revises: a1b2c3d4e5f6
Create Date: 2026-08-13 10:03:57.182694

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7259fb0743dc'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shopping_lists", sa.Column("client_request_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("shopping_lists", "client_request_id")
