from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import (
    create_access_token,
    create_user,
    decode_token,
    get_db,
    get_user_by_email,
    get_user_by_id,
    get_user_by_username,
    verify_password,
)

router = APIRouter()


async def _current_user(
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await get_user_by_id(db, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if await get_user_by_username(db, body.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    if await get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await create_user(db, body.username, body.email, body.password)
    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_username(db, body.username)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(user=Depends(_current_user)):
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# Game history
# ---------------------------------------------------------------------------

class GameParticipantOut(BaseModel):
    player_index: int
    display_name: str
    color: str
    is_winner: bool
    is_me: bool


class GameHistoryItem(BaseModel):
    game_id: str
    player_count: int
    status: str
    winner_color: Optional[str]
    winner_display_name: Optional[str]
    created_at: datetime
    ended_at: Optional[datetime]
    participants: list[GameParticipantOut]


def _participants_from_game_record(game, user_id: int) -> list[GameParticipantOut]:
    slot_colors = ["red", "blue", "yellow", "green"]
    slots = [
        (0, game.player_one_user_id, game.player_one_display_name),
        (1, game.player_two_user_id, game.player_two_display_name),
        (2, game.player_three_user_id, game.player_three_display_name),
        (3, game.player_four_user_id, game.player_four_display_name),
    ]
    participants: list[GameParticipantOut] = []
    for player_index, slot_user_id, display_name in slots[: game.player_count]:
        if slot_user_id is None and not display_name:
            continue
        participants.append(
            GameParticipantOut(
                player_index=player_index,
                display_name=display_name or f"Player {player_index + 1}",
                color=slot_colors[player_index],
                is_winner=game.winner_user_id is not None and slot_user_id == game.winner_user_id,
                is_me=slot_user_id == user_id,
            )
        )
    return participants


def _live_game_item_for_user(user_id: int, lobby) -> Optional[GameHistoryItem]:
    from app.api.routes.games import dict_to_state

    if not any(player.user_id == user_id for player in lobby.players):
        return None

    winner_color = None
    winner_display_name = None
    if lobby.engine_state:
        state = dict_to_state(lobby.engine_state)
        if state.winner_index is not None:
            winner_color = state.active_colors[state.winner_index]
            winner_player = next((p for p in lobby.players if p.color == winner_color), None)
            winner_display_name = winner_player.display_name if winner_player else None

    status = "completed" if lobby.status == "finished" else lobby.status

    return GameHistoryItem(
        game_id=lobby.game_id,
        player_count=lobby.player_count,
        status=status,
        winner_color=winner_color,
        winner_display_name=winner_display_name,
        created_at=lobby.created_at,
        ended_at=None,
        participants=[
            GameParticipantOut(
                player_index=p.player_index,
                display_name=p.display_name,
                color=p.color,
                is_winner=winner_color is not None and p.color == winner_color,
                is_me=p.user_id == user_id,
            )
            for p in sorted(lobby.players, key=lambda player: player.player_index)
        ],
    )


@router.get("/me/games", response_model=list[GameHistoryItem])
async def my_games(user=Depends(_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.game import Game
    from app.api.routes.games import _lobbies

    items_by_game_id: dict[str, GameHistoryItem] = {}

    records_result = await db.execute(
        select(Game).where(
            or_(
                Game.player_one_user_id == user.id,
                Game.player_two_user_id == user.id,
                Game.player_three_user_id == user.id,
                Game.player_four_user_id == user.id,
            )
        ).order_by(Game.created_at.desc())
    )
    records = records_result.scalars().all()

    for rec in records:
        items_by_game_id[rec.game_id] = GameHistoryItem(
            game_id=rec.game_id,
            player_count=rec.player_count,
            status=rec.status,
            winner_color=None,
            winner_display_name=rec.winner_display_name,
            created_at=rec.created_at,
            ended_at=rec.ended_at,
            participants=_participants_from_game_record(rec, user.id),
        )

    for lobby in _lobbies.values():
        live_item = _live_game_item_for_user(user.id, lobby)
        if not live_item:
            continue
        if live_item.status in ("waiting", "active", "paused"):
            items_by_game_id[live_item.game_id] = live_item
        elif live_item.game_id not in items_by_game_id:
            items_by_game_id[live_item.game_id] = live_item

    return sorted(
        items_by_game_id.values(),
        key=lambda item: item.created_at,
        reverse=True,
    )


@router.delete("/me/games/{game_id}")
async def delete_my_game(game_id: str, user=Depends(_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.game import Game
    from app.api.routes.games import _lobbies

    lobby = _lobbies.get(game_id)
    if lobby is not None:
        host = next((player for player in lobby.players if player.player_index == 0), None)
        if not host or host.user_id != user.id:
            raise HTTPException(status_code=403, detail="Only the game creator can delete this game")
        _lobbies.pop(game_id, None)

    record = (
        await db.execute(select(Game).where(Game.game_id == game_id))
    ).scalar_one_or_none()

    if record is None:
        if lobby is not None:
            return {"ok": True}
        raise HTTPException(status_code=404, detail="Game not found")

    if record.player_one_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the game creator can delete this game")

    await db.execute(delete(Game).where(Game.game_id == game_id))
    await db.commit()
    return {"ok": True}
