from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Base for response schemas that read directly from SQLAlchemy ORM instances."""

    model_config = ConfigDict(from_attributes=True)
