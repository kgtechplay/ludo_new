from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func

from app.core.database import Base


class Game(Base):
    """Database model for a Ludo game session."""

    __tablename__ = "games"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, nullable=False, default="waiting")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
