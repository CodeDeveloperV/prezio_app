"""price history update source

Revision ID: c2d3e4f5a6b7
Revises: 6a7b8c9d0e1f
Create Date: 2026-08-14 16:00:00.000000

Adds `source` to `price_history` so the UI can distinguish "reportado por la comunidad"
(mobile/crowdsourced updates) from "confirmado por el supermercado" (B2B portal updates,
Fase 10.6) without duplicating the price-change ledger. Existing rows predate this
distinction and are backfilled to COMMUNITY, since every price update before the B2B
portal existed came from the crowdsourced/mobile flow.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = '6a7b8c9d0e1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'price_history',
        sa.Column(
            'source',
            sa.Enum('COMMUNITY', 'MERCHANT', 'SYSTEM', name='priceupdatesource', native_enum=False),
            nullable=False,
            server_default='COMMUNITY',
        ),
    )


def downgrade() -> None:
    op.drop_column('price_history', 'source')
