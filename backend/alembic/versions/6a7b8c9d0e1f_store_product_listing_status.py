"""store product listing status

Revision ID: 6a7b8c9d0e1f
Revises: 55182a2f840a
Create Date: 2026-08-14 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a7b8c9d0e1f'
down_revision: Union[str, None] = '55182a2f840a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'store_products',
        sa.Column(
            'status',
            sa.Enum('ACTIVE', 'INACTIVE', name='storeproductstatus', native_enum=False),
            nullable=False,
            server_default='ACTIVE',
        ),
    )


def downgrade() -> None:
    op.drop_column('store_products', 'status')
