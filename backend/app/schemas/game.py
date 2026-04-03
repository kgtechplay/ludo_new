"""Request/response models for game state and moves."""

from pydantic import BaseModel
from typing import Literal, Optional

from app.schemas.player import PlayerCreate, PlayerState


class TokenStateSchema(BaseModel):
    """Token position for API."""

    color: str
    token_index: int
    kind: Literal["yard", "path", "home"]
    path_index: Optional[int] = None
    home_index: Optional[int] = None


class LobbyPlayerSchema(BaseModel):
    """A player slot in the lobby."""

    player_index: int
    color: str
    display_name: str
    ready: bool
    connected: bool


class LobbyStateSchema(BaseModel):
    """Lobby metadata returned to clients."""

    game_id: str
    player_count: int
    players: list[LobbyPlayerSchema]
    status: Literal["waiting", "active", "paused", "finished"]


class GameCreate(BaseModel):
    """Create game: number of players (2–4) and creator display name."""

    player_count: int = 4
    display_name: str = "Player 1"


class JoinRequest(BaseModel):
    """Request to join an existing lobby."""

    display_name: str = "Player"


class JoinResponse(BaseModel):
    """Returned to a player when they create or join a game."""

    player_id: str
    color: str
    player_index: int
    lobby: LobbyStateSchema


class GameState(BaseModel):
    """Full game state for API."""

    id: str
    status: Literal["waiting", "active", "paused", "finished"]
    player_count: int
    active_colors: list[str]
    current_player_index: int
    last_roll: Optional[int] = None
    has_rolled: bool = False
    tokens: list[TokenStateSchema]
    winner_index: Optional[int] = None
    valid_moves: list[dict] = []  # [{"color": "red", "token_index": 0, "target_kind": "path"}, ...]
    message: str = ""
    players: list[LobbyPlayerSchema] = []
    resume_ready_player_indices: list[int] = []
    resume_ready_count: int = 0
    resume_needed: int = 0


class RollResponse(BaseModel):
    """Result of rolling the dice."""

    roll: int
    valid_moves: list[dict]
    message: str = ""


class MoveRequest(BaseModel):
    """Request to move a token."""

    color: str
    token_index: int
    target_kind: Literal["path", "home"]
    path_index: Optional[int] = None
    home_index: Optional[int] = None


class MoveResponse(BaseModel):
    """Result of moving a token."""

    moved: bool
    extra_turn: bool
    captured: Optional[str] = None
    message: str = ""
