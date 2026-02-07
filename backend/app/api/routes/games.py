"""Game API: create, get, roll, move."""

import uuid
from fastapi import APIRouter, HTTPException

from app.schemas.game import (
    GameCreate,
    GameState,
    TokenStateSchema,
    RollResponse,
    MoveRequest,
    MoveResponse,
)
from app.services.game_engine import (
    GameEngine,
    GameEngineState,
    state_to_dict,
    dict_to_state,
    advance_turn,
)

router = APIRouter()

# In-memory store: game_id -> (engine_state_dict, status)
_games: dict[str, tuple[dict, str]] = {}


def _engine_state_to_schema(state: GameEngineState) -> GameState:
    tokens = [
        TokenStateSchema(
            color=t.color,
            token_index=t.token_index,
            kind=t.kind.value,
            path_index=t.path_index,
            home_index=t.home_index,
        )
        for t in state.tokens
    ]
    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}
    valid_moves: list[dict] = []
    for c, ti in engine.valid_moves(state, state.last_roll or 0):
        token = next(
            (t for t in state.tokens if t.color == c and t.token_index == ti),
            None,
        )
        if not token:
            continue
        destination = engine.get_move_destination(state, token, state.last_roll or 0)
        if not destination:
            continue
        kind, path_index, home_index = destination
        valid_moves.append(
            {
                "color": c,
                "token_index": ti,
                "target_kind": kind.value,
                "path_index": path_index,
                "home_index": home_index,
            }
        )
    status = "finished" if state.winner_index is not None else "active"
    return GameState(
        id="",
        status=status,
        player_count=state.player_count,
        active_colors=state.active_colors,
        current_player_index=state.current_player_index,
        last_roll=state.last_roll,
        has_rolled=state.has_rolled,
        tokens=tokens,
        winner_index=state.winner_index,
        valid_moves=valid_moves,
    )


@router.post("", response_model=GameState)
async def create_game(payload: GameCreate) -> GameState:
    """Create a new Ludo game (2–4 players)."""
    player_count = min(4, max(2, payload.player_count))
    engine = GameEngine(player_count=player_count)
    state = engine.new_game()
    game_id = str(uuid.uuid4())
    _games[game_id] = (state_to_dict(state), "active")
    out = _engine_state_to_schema(state)
    out.id = game_id
    return out


@router.get("/{game_id}", response_model=GameState)
async def get_game(game_id: str) -> GameState:
    """Fetch game state by ID."""
    if game_id not in _games:
        raise HTTPException(status_code=404, detail="Game not found")
    data, status = _games[game_id]
    state = dict_to_state(data)
    out = _engine_state_to_schema(state)
    out.id = game_id
    out.status = status
    return out


@router.post("/{game_id}/roll", response_model=RollResponse)
async def roll_dice(game_id: str) -> RollResponse:
    """Roll the dice for the current player."""
    if game_id not in _games:
        raise HTTPException(status_code=404, detail="Game not found")
    data, status = _games[game_id]
    if status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    state = dict_to_state(data)
    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}
    if state.has_rolled and engine.valid_moves(state, state.last_roll or 0):
        raise HTTPException(
            status_code=400,
            detail="You must move a token before rolling again",
        )
    roll = engine.roll_dice()
    state.last_roll = roll
    state.has_rolled = True
    valid_moves = engine.valid_moves(state, roll)
    _games[game_id] = (state_to_dict(state), status)
    valid_move_payloads: list[dict] = []
    for c, ti in valid_moves:
        token = next(
            (t for t in state.tokens if t.color == c and t.token_index == ti),
            None,
        )
        if not token:
            continue
        destination = engine.get_move_destination(state, token, roll)
        if not destination:
            continue
        kind, path_index, home_index = destination
        valid_move_payloads.append(
            {
                "color": c,
                "token_index": ti,
                "target_kind": kind.value,
                "path_index": path_index,
                "home_index": home_index,
            }
        )
    return RollResponse(
        roll=roll,
        valid_moves=valid_move_payloads,
        message=f"Rolled {roll}. Move a token or pass." if not valid_moves else f"Rolled {roll}.",
    )


@router.post("/{game_id}/move", response_model=GameState)
async def move_token(game_id: str, payload: MoveRequest) -> GameState:
    """Move a token (color + token_index). Returns updated game state."""
    if game_id not in _games:
        raise HTTPException(status_code=404, detail="Game not found")
    data, status = _games[game_id]
    if status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    state = dict_to_state(data)
    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}
    roll = state.last_roll
    if roll is None or not state.has_rolled:
        raise HTTPException(status_code=400, detail="Roll the dice first")
    valid_moves = engine.valid_moves(state, roll)
    if (payload.color, payload.token_index) not in valid_moves:
        raise HTTPException(status_code=400, detail="Invalid move")
    token = next(
        (t for t in state.tokens if t.color == payload.color and t.token_index == payload.token_index),
        None,
    )
    if not token:
        raise HTTPException(status_code=400, detail="Invalid token selection")
    destination = engine.get_move_destination(state, token, roll)
    if not destination:
        raise HTTPException(status_code=400, detail="Invalid move")
    expected_kind, expected_path, expected_home = destination
    if payload.target_kind != expected_kind.value:
        raise HTTPException(
            status_code=400,
            detail=f"Move must be exactly {roll} spaces for this token",
        )
    if expected_kind.value == "path" and payload.path_index != expected_path:
        raise HTTPException(
            status_code=400,
            detail=f"Move must be exactly {roll} spaces for this token",
        )
    if expected_kind.value == "home" and payload.home_index != expected_home:
        raise HTTPException(
            status_code=400,
            detail=f"Move must be exactly {roll} spaces for this token",
        )
    result = engine.apply_move(state, payload.color, payload.token_index, roll)
    if not result.moved:
        raise HTTPException(status_code=400, detail=result.message)
    if not result.extra_turn:
        advance_turn(state)
    else:
        state.last_roll = None
        state.has_rolled = False
    if state.winner_index is not None:
        status = "finished"
    _games[game_id] = (state_to_dict(state), status)
    out = _engine_state_to_schema(state)
    out.id = game_id
    out.status = status
    out.message = result.message
    return out


@router.post("/{game_id}/pass")
async def pass_turn(game_id: str) -> GameState:
    """Pass turn when no valid move (e.g. no 6 to leave yard)."""
    if game_id not in _games:
        raise HTTPException(status_code=404, detail="Game not found")
    data, status = _games[game_id]
    if status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    state = dict_to_state(data)
    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}
    roll = state.last_roll
    if roll is None or not state.has_rolled:
        raise HTTPException(status_code=400, detail="Roll the dice first")
    valid_moves = engine.valid_moves(state, roll)
    if valid_moves:
        raise HTTPException(status_code=400, detail="You have valid moves; cannot pass")
    advance_turn(state)
    state.last_roll = None
    state.has_rolled = False
    _games[game_id] = (state_to_dict(state), status)
    out = _engine_state_to_schema(state)
    out.id = game_id
    return out
