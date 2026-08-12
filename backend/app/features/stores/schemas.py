from app.shared.base_schemas import ORMModel


class StoreRead(ORMModel):
    id: int
    name: str
    country: str


class StoreBranchRead(ORMModel):
    id: int
    store_id: int
    name: str
    city: str
