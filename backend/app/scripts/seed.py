"""One representative branch per Panama supermarket chain -- scaffolding data, not real entries.

Run with: python -m app.scripts.seed
"""

import asyncio

from app.core.db import AsyncSessionLocal
from app.features.stores.models import Store, StoreBranch

PANAMA_CHAINS = [
    ("Supermercados Rey", "Vía España, Ciudad de Panamá"),
    ("Supermercados Romero", "Tumba Muerto, Ciudad de Panamá"),
    ("Mr. Precio", "San Miguelito, Ciudad de Panamá"),
    ("Super 99", "El Dorado, Ciudad de Panamá"),
    ("Riba Smith", "Costa del Este, Ciudad de Panamá"),
    ("PriceSmart", "Brisas del Golf, Ciudad de Panamá"),
    ("Xtra", "Los Andes, Ciudad de Panamá"),
    ("Machetazo", "Calidonia, Ciudad de Panamá"),
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        for chain_name, branch_name in PANAMA_CHAINS:
            store = Store(name=chain_name, country="PA")
            session.add(store)
            await session.flush()  # need store.id before creating the branch

            session.add(
                StoreBranch(store_id=store.id, name=f"{chain_name} - {branch_name}", city="Ciudad de Panamá")
            )

        await session.commit()
    print(f"Seeded {len(PANAMA_CHAINS)} stores with one branch each.")


if __name__ == "__main__":
    asyncio.run(seed())
