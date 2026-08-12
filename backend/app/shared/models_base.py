from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base so Alembic autogenerate sees every feature's models."""
