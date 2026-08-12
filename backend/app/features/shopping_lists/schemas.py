from pydantic import BaseModel

from app.shared.base_schemas import ORMModel


class ShoppingListCreate(BaseModel):
    name: str


class ShoppingListItemCreate(BaseModel):
    product_id: int
    quantity: int = 1


class ShoppingListItemRead(ORMModel):
    id: int
    shopping_list_id: int
    product_id: int
    quantity: int
    checked: bool
    added_by: int


class ShoppingListRead(ORMModel):
    id: int
    owner_user_id: int
    name: str
