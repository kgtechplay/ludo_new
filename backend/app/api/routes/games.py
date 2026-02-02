from fastapi import APIRouter

from app.schemas.game import GameCreate, GameState

router = APIRouter()


@router.post("", response_model=GameState)
async def create_game(payload: GameCreate) -> GameState:
    """Create a new game session (placeholder)."""
    return GameState(id="game_001", players=payload.players, status="waiting")


@router.get("/{game_id}", response_model=GameState)
async def get_game(game_id: str) -> GameState:
    """Fetch a game session (placeholder)."""
    return GameState(id=game_id, players=[], status="pending")
