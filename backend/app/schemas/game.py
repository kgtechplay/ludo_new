from pydantic import BaseModel

from app.schemas.player import PlayerCreate, PlayerState


class GameCreate(BaseModel):
    players: list[PlayerCreate]


class GameState(BaseModel):
    id: str
    players: list[PlayerState | PlayerCreate]
    status: str
