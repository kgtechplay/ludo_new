from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Player(Base):
    """Database model for a player in a game."""

    __tablename__ = "players"

    id = Column(String, primary_key=True, index=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False)

    game = relationship("Game", backref="players")
