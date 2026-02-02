from pydantic import BaseModel


class PlayerCreate(BaseModel):
    name: str
    color: str


class PlayerState(PlayerCreate):
    id: str
