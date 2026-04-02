"""Game API: create, join, ready, roll, move, pass, chance, websocket."""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.game import (
    GameCreate,
    GameState,
    JoinRequest,
    JoinResponse,
    LobbyPlayerSchema,
    LobbyStateSchema,
    TokenStateSchema,
    RollResponse,
    MoveRequest,
    MoveResponse,
)
from app.services.connection_manager import manager
from app.services.game_engine import (
    GameEngine,
    GameEngineState,
    ACTIVE_COLORS_BY_COUNT,
    state_to_dict,
    dict_to_state,
    advance_turn,
)
from app.services.auth_service import decode_token, get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# In-memory lobby store
# ---------------------------------------------------------------------------

@dataclass
class PlayerRecord:
    player_id: str
    color: str
    player_index: int
    display_name: str
    ready: bool = False
    connected: bool = False
    user_id: Optional[int] = None


@dataclass
class LobbyRecord:
    game_id: str
    player_count: int
    players: list[PlayerRecord] = field(default_factory=list)
    status: str = "waiting"          # "waiting" | "active" | "paused" | "finished"
    engine_state: Optional[dict] = None  # None until all players ready
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    resume_ready_set: set = field(default_factory=set)  # player_ids who clicked resume


_lobbies: dict[str, LobbyRecord] = {}


# ---------------------------------------------------------------------------
# Helpers: DB persistence
# ---------------------------------------------------------------------------

def _optional_user_id(authorization: str) -> Optional[int]:
    """Extract user_id from Bearer token if present, else None."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    payload = decode_token(token)
    sub = payload.get("sub")
    return int(sub) if sub else None


def _bind_player_user(
    lobby: "LobbyRecord",
    player: "PlayerRecord",
    authorization: str,
) -> None:
    """Attach an authenticated user id to the in-memory player record when available."""
    user_id = _optional_user_id(authorization)
    if user_id is not None:
        player.user_id = user_id


def _stable_player_id(game_id: str, player_index: int) -> str:
    """Build a deterministic player id for DB-restored games."""
    return f"restored:{game_id}:{player_index}"


async def _persist_game(lobby: LobbyRecord, db: AsyncSession) -> None:
    """Upsert a single persisted game row keyed by game_id."""
    import app.models.game  # noqa: F401
    from sqlalchemy import select
    from app.models.game import Game

    state = lobby.engine_state
    winner_display_name = None
    winner_user_id = None
    if state:
        eng_state = dict_to_state(state)
        if eng_state.winner_index is not None:
            winner_color = eng_state.active_colors[eng_state.winner_index]
            winner_player = next(
                (p for p in lobby.players if p.color == winner_color), None
            )
            if winner_player:
                winner_display_name = winner_player.display_name
                winner_user_id = winner_player.user_id

    result = await db.execute(
        select(Game).where(Game.game_id == lobby.game_id)
    )
    record = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    players = sorted(lobby.players, key=lambda player: player.player_index)
    persisted_status = "completed" if lobby.status == "finished" else lobby.status

    def user_id_at(index: int) -> Optional[int]:
        return players[index].user_id if index < len(players) else None

    def display_name_at(index: int) -> Optional[str]:
        return players[index].display_name if index < len(players) else None

    if record is None:
        record = Game(
            game_id=lobby.game_id,
            player_count=lobby.player_count,
            status=persisted_status,
            winner_display_name=winner_display_name,
            winner_user_id=winner_user_id,
            engine_state_json=json.dumps(lobby.engine_state) if lobby.engine_state else None,
            created_at=lobby.created_at,
            ended_at=now if persisted_status in ("completed", "aborted") else None,
            player_one_user_id=user_id_at(0),
            player_two_user_id=user_id_at(1),
            player_three_user_id=user_id_at(2),
            player_four_user_id=user_id_at(3),
            player_one_display_name=display_name_at(0),
            player_two_display_name=display_name_at(1),
            player_three_display_name=display_name_at(2),
            player_four_display_name=display_name_at(3),
        )
        db.add(record)
    else:
        record.status = persisted_status
        record.winner_display_name = winner_display_name
        record.winner_user_id = winner_user_id
        record.engine_state_json = json.dumps(lobby.engine_state) if lobby.engine_state else None
        record.player_one_user_id = user_id_at(0)
        record.player_two_user_id = user_id_at(1)
        record.player_three_user_id = user_id_at(2)
        record.player_four_user_id = user_id_at(3)
        record.player_one_display_name = display_name_at(0)
        record.player_two_display_name = display_name_at(1)
        record.player_three_display_name = display_name_at(2)
        record.player_four_display_name = display_name_at(3)
        if persisted_status in ("completed", "aborted"):
            record.ended_at = now
        elif persisted_status in ("active", "paused", "waiting"):
            record.ended_at = None

    await db.commit()


async def _restore_lobby_from_db(
    game_id: str,
    db: Optional[AsyncSession] = None,
) -> Optional["LobbyRecord"]:
    """Rehydrate a lobby from the persisted games table when memory was lost."""
    import app.models.game  # noqa: F401
    from sqlalchemy import select
    from app.models.game import Game

    own_session = False
    if db is None:
        from app.core.database import SessionLocal

        db = SessionLocal()
        own_session = True

    try:
        result = await db.execute(select(Game).where(Game.game_id == game_id))
        record = result.scalar_one_or_none()
        if record is None:
            return None

        if record.status not in ("active", "paused", "completed"):
            return None

        if not record.engine_state_json:
            return None

        slots = [
            (0, "red", record.player_one_display_name, record.player_one_user_id),
            (1, "blue", record.player_two_display_name, record.player_two_user_id),
            (2, "yellow", record.player_three_display_name, record.player_three_user_id),
            (3, "green", record.player_four_display_name, record.player_four_user_id),
        ]
        players = [
            PlayerRecord(
                player_id=_stable_player_id(game_id, player_index),
                color=color,
                player_index=player_index,
                display_name=display_name or f"Player {player_index + 1}",
                ready=True,
                connected=False,
                user_id=user_id,
            )
            for player_index, color, display_name, user_id in slots[: record.player_count]
            if user_id is not None or display_name
        ]

        restored_status = "finished" if record.status == "completed" else record.status
        lobby = LobbyRecord(
            game_id=record.game_id,
            player_count=record.player_count,
            players=players,
            status=restored_status,
            engine_state=json.loads(record.engine_state_json),
            created_at=record.created_at,
        )
        _lobbies[game_id] = lobby
        return lobby
    finally:
        if own_session:
            await db.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lobby_to_schema(lobby: LobbyRecord) -> LobbyStateSchema:
    return LobbyStateSchema(
        game_id=lobby.game_id,
        player_count=lobby.player_count,
        players=[
            LobbyPlayerSchema(
                player_index=p.player_index,
                color=p.color,
                display_name=p.display_name,
                ready=p.ready,
                connected=p.connected,
            )
            for p in lobby.players
        ],
        status=lobby.status,  # type: ignore[arg-type]
    )


def _engine_state_to_schema(game_id: str, state: GameEngineState, lobby: LobbyRecord) -> GameState:
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
    if state.winner_index is not None:
        status = "finished"
    elif lobby.status == "paused":
        status = "paused"
    else:
        status = "active"
    lobby_players = [
        LobbyPlayerSchema(
            player_index=p.player_index,
            color=p.color,
            display_name=p.display_name,
            ready=p.ready,
            connected=p.connected,
        )
        for p in lobby.players
    ]
    return GameState(
        id=game_id,
        status=status,  # type: ignore[arg-type]
        player_count=state.player_count,
        active_colors=state.active_colors,
        current_player_index=state.current_player_index,
        last_roll=state.last_roll,
        has_rolled=state.has_rolled,
        tokens=tokens,
        winner_index=state.winner_index,
        valid_moves=valid_moves,
        players=lobby_players,
    )


async def _get_lobby(game_id: str, db: Optional[AsyncSession] = None) -> LobbyRecord:
    lobby = _lobbies.get(game_id)
    if lobby is not None:
        return lobby
    restored = await _restore_lobby_from_db(game_id, db)
    if restored is not None:
        return restored
    raise HTTPException(status_code=404, detail="Game not found")


def _sync_player_identity_from_auth(
    lobby: LobbyRecord,
    player_id: Optional[str],
    authorization: str,
) -> Optional[PlayerRecord]:
    """Rebind a restored player's transient player_id using the authenticated user."""
    user_id = _optional_user_id(authorization)
    if user_id is None:
        return None
    record = next((p for p in lobby.players if p.user_id == user_id), None)
    if record and player_id and record.player_id != player_id:
        record.player_id = player_id
    return record


def _require_active_player(
    lobby: LobbyRecord,
    player_id: Optional[str],
    authorization: str = "",
) -> PlayerRecord:
    """Validate X-Player-ID header and return the matching PlayerRecord."""
    record = next((p for p in lobby.players if p.player_id == player_id), None) if player_id else None
    if not record:
        record = _sync_player_identity_from_auth(lobby, player_id, authorization)
    if not record:
        if not player_id:
            raise HTTPException(status_code=403, detail="Missing X-Player-ID header")
        raise HTTPException(status_code=403, detail="Unknown player for this game")
    return record


def _check_turn(
    lobby: LobbyRecord,
    player_id: Optional[str],
    state: GameEngineState,
    authorization: str = "",
) -> None:
    """Raise 403 if it is not this player's turn."""
    record = _require_active_player(lobby, player_id, authorization)
    current_color = state.active_colors[state.current_player_index]
    if record.color != current_color:
        raise HTTPException(status_code=403, detail="Not your turn")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=JoinResponse)
async def create_game(
    payload: GameCreate,
    authorization: str = Header(default=""),
) -> JoinResponse:
    """Create a new lobby. Returns creator's player_id and assigned color."""
    player_count = min(4, max(2, payload.player_count))
    active_colors = list(ACTIVE_COLORS_BY_COUNT.get(player_count, ("red", "blue", "yellow", "green")[:player_count]))
    game_id = str(uuid.uuid4())
    player_id = str(uuid.uuid4())
    creator = PlayerRecord(
        player_id=player_id,
        color=active_colors[0],
        player_index=0,
        display_name=payload.display_name,
        user_id=_optional_user_id(authorization),
    )
    lobby = LobbyRecord(
        game_id=game_id,
        player_count=player_count,
        players=[creator],
        status="waiting",
    )
    _lobbies[game_id] = lobby
    return JoinResponse(
        player_id=player_id,
        color=creator.color,
        player_index=0,
        lobby=_lobby_to_schema(lobby),
    )


@router.post("/{game_id}/join", response_model=JoinResponse)
async def join_game(
    game_id: str,
    payload: JoinRequest,
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> JoinResponse:
    """Join an existing lobby. Returns this player's player_id and assigned color."""
    lobby = await _get_lobby(game_id)
    authenticated_user_id = _optional_user_id(authorization)

    if authenticated_user_id is not None:
        existing_record = next(
            (player for player in lobby.players if player.user_id == authenticated_user_id),
            None,
        )
        if existing_record is not None:
            existing_record.display_name = payload.display_name or existing_record.display_name
            return JoinResponse(
                player_id=existing_record.player_id,
                color=existing_record.color,
                player_index=existing_record.player_index,
                lobby=_lobby_to_schema(lobby),
            )

    # Older games may have invited/guest seats persisted without a bound user id.
    # Allow a signed-in user to reclaim exactly one unbound slot on resumable games.
    if authenticated_user_id is not None and lobby.status in ("active", "paused"):
        unbound_players = [player for player in lobby.players if player.user_id is None]
        if len(unbound_players) == 1:
            reclaimed = unbound_players[0]
            reclaimed.user_id = authenticated_user_id
            if payload.display_name and payload.display_name != "Player":
                reclaimed.display_name = payload.display_name
            await _persist_game(lobby, db)
            return JoinResponse(
                player_id=reclaimed.player_id,
                color=reclaimed.color,
                player_index=reclaimed.player_index,
                lobby=_lobby_to_schema(lobby),
            )

    if lobby.status not in ("waiting", "paused"):
        raise HTTPException(status_code=400, detail="Game already started")
    if len(lobby.players) >= lobby.player_count:
        raise HTTPException(status_code=400, detail="Game is full")
    active_colors = list(ACTIVE_COLORS_BY_COUNT.get(lobby.player_count, ("red", "blue", "yellow", "green")[:lobby.player_count]))
    player_index = len(lobby.players)
    player_id = str(uuid.uuid4())
    record = PlayerRecord(
        player_id=player_id,
        color=active_colors[player_index],
        player_index=player_index,
        display_name=payload.display_name,
        user_id=authenticated_user_id,
    )
    lobby.players.append(record)
    await manager.broadcast(game_id, {
        "type": "player_joined",
        "lobby": _lobby_to_schema(lobby).model_dump(),
    })
    return JoinResponse(
        player_id=player_id,
        color=record.color,
        player_index=player_index,
        lobby=_lobby_to_schema(lobby),
    )


@router.post("/{game_id}/ready", response_model=LobbyStateSchema)
async def mark_ready(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> LobbyStateSchema:
    """Mark a player as ready. When all players ready, game transitions to active."""
    lobby = await _get_lobby(game_id, db)
    if lobby.status != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")
    record = _require_active_player(lobby, x_player_id, authorization)
    _bind_player_user(lobby, record, authorization)
    record.ready = True

    all_ready = (
        len(lobby.players) == lobby.player_count
        and all(p.ready for p in lobby.players)
    )

    if all_ready:
        engine = GameEngine(player_count=lobby.player_count)
        state = engine.new_game()
        lobby.engine_state = state_to_dict(state)
        lobby.status = "active"
        await _persist_game(lobby, db)
        game_schema = _engine_state_to_schema(game_id, state, lobby)
        await manager.broadcast(game_id, {
            "type": "game_started",
            "game": game_schema.model_dump(),
        })
    else:
        await manager.broadcast(game_id, {
            "type": "player_ready",
            "player_index": record.player_index,
            "lobby": _lobby_to_schema(lobby).model_dump(),
        })

    return _lobby_to_schema(lobby)


@router.websocket("/{game_id}/ws")
async def websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str) -> None:
    """WebSocket connection for real-time game updates."""
    lobby = await _get_lobby(game_id)
    if not lobby:
        await websocket.close(code=4004)
        return

    record = next((p for p in lobby.players if p.player_id == player_id), None)
    if not record:
        await websocket.close(code=4003)
        return

    await manager.connect(game_id, player_id, websocket)
    record.connected = True

    # Send current state on connect
    game_data = None
    if lobby.engine_state is not None:
        state = dict_to_state(lobby.engine_state)
        game_data = _engine_state_to_schema(game_id, state, lobby).model_dump()

    await manager.send_to(game_id, player_id, {
        "type": "sync",
        "lobby": _lobby_to_schema(lobby).model_dump(),
        "game": game_data,
    })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "rolling_start":
                    await manager.broadcast_except(game_id, player_id, {
                        "type": "opponent_rolling",
                        "player_index": record.player_index,
                    })
                elif msg.get("type") == "rolling_stop":
                    await manager.broadcast_except(game_id, player_id, {
                        "type": "opponent_rolling_stop",
                        "player_index": record.player_index,
                    })
            except (json.JSONDecodeError, KeyError):
                pass
    except WebSocketDisconnect:
        pass
    finally:
        record.connected = False
        manager.disconnect(game_id, player_id)
        await manager.broadcast(game_id, {
            "type": "player_disconnected",
            "player_index": record.player_index,
            "lobby": _lobby_to_schema(lobby).model_dump(),
        })


@router.get("/{game_id}", response_model=GameState)
async def get_game(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> GameState:
    """Fetch game state by ID."""
    lobby = await _get_lobby(game_id, db)
    _sync_player_identity_from_auth(lobby, x_player_id, authorization)
    if lobby.status == "waiting" or lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")
    state = dict_to_state(lobby.engine_state)
    return _engine_state_to_schema(game_id, state, lobby)


@router.get("/{game_id}/lobby", response_model=LobbyStateSchema)
async def get_lobby_state(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> LobbyStateSchema:
    """Fetch lobby metadata even when the game has not started yet."""
    lobby = await _get_lobby(game_id, db)
    _sync_player_identity_from_auth(lobby, x_player_id, authorization)
    return _lobby_to_schema(lobby)


@router.post("/{game_id}/roll", response_model=RollResponse)
async def roll_dice(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
) -> RollResponse:
    """Roll the dice for the current player."""
    lobby = await _get_lobby(game_id)
    if lobby.status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    if lobby.status != "active" or lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")
    state = dict_to_state(lobby.engine_state)
    _check_turn(lobby, x_player_id, state, authorization)
    _bind_player_user(lobby, _require_active_player(lobby, x_player_id, authorization), authorization)

    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}

    if state.has_rolled and engine.valid_moves(state, state.last_roll or 0):
        raise HTTPException(status_code=400, detail="You must move a token before rolling again")

    roll = engine.roll_dice()
    state.last_roll = roll
    state.has_rolled = True
    valid_moves = engine.valid_moves(state, roll)
    lobby.engine_state = state_to_dict(state)

    valid_move_payloads: list[dict] = []
    for c, ti in valid_moves:
        token = next((t for t in state.tokens if t.color == c and t.token_index == ti), None)
        if not token:
            continue
        destination = engine.get_move_destination(state, token, roll)
        if not destination:
            continue
        kind, path_index, home_index = destination
        valid_move_payloads.append({
            "color": c,
            "token_index": ti,
            "target_kind": kind.value,
            "path_index": path_index,
            "home_index": home_index,
        })

    roll_response = RollResponse(
        roll=roll,
        valid_moves=valid_move_payloads,
        message=f"Rolled {roll}. Move a token or pass." if not valid_moves else f"Rolled {roll}.",
    )

    game_schema = _engine_state_to_schema(game_id, state, lobby)
    await manager.broadcast(game_id, {
        "type": "game_state_updated",
        "event": "rolled",
        "player_index": state.current_player_index,
        "game": game_schema.model_dump(),
    })

    return roll_response


@router.post("/{game_id}/move", response_model=GameState)
async def move_token(
    game_id: str,
    payload: MoveRequest,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
) -> GameState:
    """Move a token. Returns updated game state."""
    lobby = await _get_lobby(game_id)
    if lobby.status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    if lobby.status != "active" or lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")
    state = dict_to_state(lobby.engine_state)
    _check_turn(lobby, x_player_id, state, authorization)
    _bind_player_user(lobby, _require_active_player(lobby, x_player_id, authorization), authorization)

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
        raise HTTPException(status_code=400, detail=f"Move must be exactly {roll} spaces for this token")
    if expected_kind.value == "path" and payload.path_index != expected_path:
        raise HTTPException(status_code=400, detail=f"Move must be exactly {roll} spaces for this token")
    if expected_kind.value == "home" and payload.home_index != expected_home:
        raise HTTPException(status_code=400, detail=f"Move must be exactly {roll} spaces for this token")

    result = engine.apply_move(state, payload.color, payload.token_index, roll)
    if not result.moved:
        raise HTTPException(status_code=400, detail=result.message)

    if not result.extra_turn:
        advance_turn(state)
    else:
        state.last_roll = None
        state.has_rolled = False

    if state.winner_index is not None:
        lobby.status = "finished"

    lobby.engine_state = state_to_dict(state)
    out = _engine_state_to_schema(game_id, state, lobby)
    out.message = result.message

    event_type = "game_finished" if lobby.status == "finished" else "game_state_updated"
    broadcast_msg: dict = {
        "type": event_type,
        "event": "moved",
        "player_index": state.current_player_index,
        "game": out.model_dump(),
    }
    if lobby.status == "finished" and state.winner_index is not None:
        broadcast_msg["winner_index"] = state.winner_index
        broadcast_msg["winner_color"] = state.active_colors[state.winner_index]
    await manager.broadcast(game_id, broadcast_msg)

    if lobby.status == "finished":
        async with __import__("app.core.database", fromlist=["SessionLocal"]).SessionLocal() as db:
            await _persist_game(lobby, db)

    return out


@router.post("/{game_id}/pass", response_model=GameState)
async def pass_turn(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
) -> GameState:
    """Pass turn when no valid move available."""
    lobby = await _get_lobby(game_id)
    if lobby.status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    if lobby.status != "active" or lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")
    state = dict_to_state(lobby.engine_state)
    _check_turn(lobby, x_player_id, state, authorization)
    _bind_player_user(lobby, _require_active_player(lobby, x_player_id, authorization), authorization)

    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}

    roll = state.last_roll
    if roll is None or not state.has_rolled:
        raise HTTPException(status_code=400, detail="Roll the dice first")
    if engine.valid_moves(state, roll):
        raise HTTPException(status_code=400, detail="You have valid moves; cannot pass")

    advance_turn(state)
    state.last_roll = None
    state.has_rolled = False
    lobby.engine_state = state_to_dict(state)

    out = _engine_state_to_schema(game_id, state, lobby)
    await manager.broadcast(game_id, {
        "type": "game_state_updated",
        "event": "passed",
        "player_index": state.current_player_index,
        "game": out.model_dump(),
    })
    return out


@router.post("/{game_id}/chance", response_model=GameState)
async def play_chance(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
) -> GameState:
    """Use chance instead of rolling the dice for this turn."""
    lobby = await _get_lobby(game_id)
    if lobby.status == "finished":
        raise HTTPException(status_code=400, detail="Game is finished")
    if lobby.status != "active" or lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")
    state = dict_to_state(lobby.engine_state)
    _check_turn(lobby, x_player_id, state, authorization)
    _bind_player_user(lobby, _require_active_player(lobby, x_player_id, authorization), authorization)

    engine = GameEngine(player_count=state.player_count)
    engine.active_colors = state.active_colors
    engine.color_index = {c: i for i, c in enumerate(state.active_colors)}

    if state.has_rolled:
        raise HTTPException(status_code=400, detail="Cannot use chance after rolling")

    message, turns_to_advance = engine.apply_random_chance(state)
    if state.winner_index is None:
        for _ in range(max(1, turns_to_advance)):
            advance_turn(state)
    else:
        lobby.status = "finished"

    lobby.engine_state = state_to_dict(state)
    out = _engine_state_to_schema(game_id, state, lobby)
    out.message = message

    event_type = "game_finished" if lobby.status == "finished" else "game_state_updated"
    broadcast_msg: dict = {
        "type": event_type,
        "event": "chance",
        "player_index": state.current_player_index,
        "game": out.model_dump(),
    }
    if lobby.status == "finished" and state.winner_index is not None:
        broadcast_msg["winner_index"] = state.winner_index
        broadcast_msg["winner_color"] = state.active_colors[state.winner_index]
    await manager.broadcast(game_id, broadcast_msg)

    if lobby.status == "finished":
        async with __import__("app.core.database", fromlist=["SessionLocal"]).SessionLocal() as db:
            await _persist_game(lobby, db)

    return out


# ---------------------------------------------------------------------------
# Pause / Reset
# ---------------------------------------------------------------------------

@router.post("/{game_id}/pause", response_model=GameState)
async def pause_game(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> GameState:
    """Pause an active game and persist its state."""
    lobby = await _get_lobby(game_id, db)
    record = _require_active_player(lobby, x_player_id, authorization)
    _bind_player_user(lobby, record, authorization)
    if lobby.status != "active":
        raise HTTPException(status_code=400, detail="Game is not active")
    if lobby.engine_state is None:
        raise HTTPException(status_code=400, detail="Game has not started yet")

    lobby.status = "paused"
    lobby.resume_ready_set = set()  # clear any stale votes
    await _persist_game(lobby, db)

    state = dict_to_state(lobby.engine_state)
    out = _engine_state_to_schema(game_id, state, lobby)
    await manager.broadcast(game_id, {"type": "game_paused", "game": out.model_dump()})
    return out


@router.post("/{game_id}/resume", response_model=GameState)
async def resume_game(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> GameState:
    """Vote to resume a paused game. Game resumes when all players have voted."""
    lobby = await _get_lobby(game_id, db)
    record = _require_active_player(lobby, x_player_id, authorization)
    _bind_player_user(lobby, record, authorization)
    if lobby.status != "paused":
        raise HTTPException(status_code=400, detail="Game is not paused")

    lobby.resume_ready_set.add(record.player_id)
    resume_count = len(lobby.resume_ready_set)
    resume_needed = lobby.player_count

    state = dict_to_state(lobby.engine_state)

    if resume_count >= resume_needed:
        lobby.status = "active"
        lobby.resume_ready_set = set()
        await _persist_game(lobby, db)
        out = _engine_state_to_schema(game_id, state, lobby)
        await manager.broadcast(game_id, {"type": "game_resumed", "game": out.model_dump()})
    else:
        await _persist_game(lobby, db)
        out = _engine_state_to_schema(game_id, state, lobby)
        await manager.broadcast(game_id, {
            "type": "resume_ready",
            "resume_count": resume_count,
            "resume_needed": resume_needed,
            "player_index": record.player_index,
        })

    return out


@router.post("/{game_id}/reset", response_model=LobbyStateSchema)
async def reset_game(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> LobbyStateSchema:
    """Reset a game back to the waiting/lobby state (host only)."""
    lobby = await _get_lobby(game_id, db)
    record = _require_active_player(lobby, x_player_id, authorization)
    _bind_player_user(lobby, record, authorization)
    if record.player_index != 0:
        raise HTTPException(status_code=403, detail="Only the host can reset the game")
    if lobby.status == "waiting":
        raise HTTPException(status_code=400, detail="Game is already in lobby")

    if lobby.status != "finished":
        previous_status = lobby.status
        lobby.status = "aborted"
        await _persist_game(lobby, db)
        lobby.status = previous_status

    for p in lobby.players:
        p.ready = False
    lobby.status = "waiting"
    lobby.engine_state = None

    schema = _lobby_to_schema(lobby)
    await manager.broadcast(game_id, {"type": "game_reset", "lobby": schema.model_dump()})
    return schema


@router.post("/{game_id}/claim")
async def claim_game(
    game_id: str,
    x_player_id: Optional[str] = Header(default=None),
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Bind the current authenticated user to an existing player slot and persist it for history."""
    lobby = await _get_lobby(game_id, db)
    record = _require_active_player(lobby, x_player_id, authorization)
    _bind_player_user(lobby, record, authorization)
    await _persist_game(lobby, db)
    return {"ok": True}
