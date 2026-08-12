from app.shared.base_schemas import ORMModel


class UserRead(ORMModel):
    id: int
    email: str
    is_active: bool
