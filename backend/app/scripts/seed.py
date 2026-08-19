"""One representative branch per Panama supermarket chain -- scaffolding data, not real entries.

Run with: python -m app.scripts.seed
"""

import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.features.catalog.models import Category
from app.features.pricing.models import TaxRate
from app.features.stores.models import Store, StoreBranch
# Register the complete SQLAlchemy model graph before instantiating Store.  Some relationships
# (for example PriceHistory.updated_by_user) refer to models outside the narrow seed imports.
import app.shared.all_models  # noqa: F401

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

# Default supermarket taxonomy -- there's no admin panel yet to manage categories, so this is a
# reasonable starting set (adjust freely once real category needs emerge). Each parent maps to a
# list of subcategories; both levels are exposed via GET /catalog/categories.
CATEGORY_TAXONOMY = {
    "Frutas y Verduras": ["Frutas", "Verduras y Hortalizas", "Hierbas Frescas"],
    "Carnes y Mariscos": ["Res", "Pollo", "Cerdo", "Pescados y Mariscos", "Embutidos y Fiambres"],
    "Lácteos y Huevos": ["Leche", "Quesos", "Yogures", "Mantequilla y Margarina", "Huevos"],
    "Panadería y Repostería": ["Pan", "Tortillas", "Pasteles y Postres", "Ingredientes de Repostería"],
    "Abarrotes": ["Arroz y Granos", "Pastas", "Aceites y Vinagres", "Enlatados", "Salsas y Condimentos", "Azúcar y Sal"],
    "Bebidas": ["Agua", "Jugos", "Gaseosas", "Café y Té", "Bebidas Alcohólicas"],
    "Snacks y Dulces": ["Snacks Salados", "Chocolates y Dulces", "Galletas"],
    "Congelados": ["Vegetales Congelados", "Comidas Congeladas", "Helados"],
    "Cuidado Personal": ["Higiene Oral", "Cuidado del Cabello", "Cuidado de la Piel", "Higiene Femenina"],
    "Limpieza del Hogar": ["Detergentes", "Desinfectantes", "Papel Higiénico y Servilletas", "Utensilios de Limpieza"],
    "Bebés": ["Pañales y Toallitas", "Fórmula y Alimentos para Bebé"],
    "Mascotas": ["Alimento para Perros", "Alimento para Gatos", "Accesorios para Mascotas"],
    "Farmacia": ["Medicamentos de Venta Libre", "Vitaminas y Suplementos"],
}

# ITBMS rates verified against the DGI. Exempt products are represented by no tax_rate_id,
# rather than a fake 0% tax row, so the system can distinguish exempt from taxed at zero.
PANAMA_TAX_RATES = [
    ("ITBMS_7", "ITBMS 7%", "0.0700"),
    ("ITBMS_ALCOHOL_10", "ITBMS bebidas alcohólicas 10%", "0.1000"),
    ("ITBMS_TOBACCO_15", "ITBMS derivados del tabaco 15%", "0.1500"),
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

    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(TaxRate.id).where(TaxRate.country == "PA").limit(1))
        if existing.scalar_one_or_none() is None:
            session.add_all(
                [TaxRate(country="PA", code=code, name=name, rate=rate) for code, name, rate in PANAMA_TAX_RATES]
            )
            await session.commit()
            print(f"Seeded {len(PANAMA_TAX_RATES)} Panama tax rates.")
        else:
            print("Panama tax rates already seeded, skipping.")

    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Category.id).limit(1))
        if existing.scalar_one_or_none() is not None:
            print("Categories already seeded, skipping.")
            return

        category_count = 0
        for parent_name, children in CATEGORY_TAXONOMY.items():
            parent = Category(name=parent_name)
            session.add(parent)
            await session.flush()  # need parent.id before creating children
            category_count += 1

            for child_name in children:
                session.add(Category(name=child_name, parent_id=parent.id))
                category_count += 1

        await session.commit()
    print(f"Seeded {category_count} categories.")


if __name__ == "__main__":
    asyncio.run(seed())
