"""Ludo game rules engine: board, moves, capture, blocks, safe squares, home."""

from dataclasses import dataclass, field
from enum import Enum
import random
from typing import Optional

# Colors in turn order (clockwise on board)
COLORS = ("red", "blue", "yellow", "green")

# Diagonal placement for 2-player games uses red + yellow.
ACTIVE_COLORS_BY_COUNT = {
    2: ("red", "yellow"),
    3: ("red", "blue", "yellow"),
    4: COLORS,
}

# Main track: 52 squares, clockwise. Start path index when leaving yard.
START_PATH_INDEX = {"red": 0, "blue": 39, "yellow": 13, "green": 26}

# Path index where each color turns into home column (5 squares)
HOME_ENTRANCE_PATH = {"red": 50, "blue": 12, "yellow": 25, "green": 38}

# Safe squares (star): cannot be captured
SAFE_PATH_INDEXES = {0, 8, 13, 21, 26, 34, 39, 47}

TOKENS_PER_PLAYER = 4
PATH_LENGTH = 52


class TokenPositionKind(str, Enum):
    YARD = "yard"
    PATH = "path"
    HOME = "home"


@dataclass
class TokenState:
    """State of a single token."""

    color: str
    token_index: int  # 0-3
    kind: TokenPositionKind
    path_index: Optional[int] = None  # 0-51 when on path
    home_index: Optional[int] = None   # 0-4 when in home column

    def at_path_index(self, idx: int) -> bool:
        return self.kind == TokenPositionKind.PATH and self.path_index == idx

    def at_home_index(self, idx: int) -> bool:
        return self.kind == TokenPositionKind.HOME and self.home_index == idx


@dataclass
class MoveResult:
    """Result of applying a move."""

    moved: bool
    extra_turn: bool
    captured: Optional[str] = None  # color of captured token, if any
    message: str = ""


@dataclass
class GameEngineState:
    """Full in-memory game state for Ludo."""

    current_player_index: int
    last_roll: Optional[int] = None
    has_rolled: bool = False
    tokens: list[TokenState] = field(default_factory=list)
    winner_index: Optional[int] = None
    player_count: int = 4
    active_colors: list[str] = field(default_factory=list)

    def get_tokens_by_color(self, color: str) -> list[TokenState]:
        return [t for t in self.tokens if t.color == color]

    def get_tokens_at_path(self, path_index: int) -> list[TokenState]:
        return [t for t in self.tokens if t.at_path_index(path_index)]

    def get_tokens_at_home(self, color: str, home_index: int) -> list[TokenState]:
        return [t for t in self.tokens if t.color == color and t.at_home_index(home_index)]

    def is_blocked(self, path_index: int, moving_color: str) -> bool:
        """Block = two or more tokens of same color on same square (others cannot pass/land)."""
        at = self.get_tokens_at_path(path_index)
        if len(at) < 2:
            return False
        return all(t.color == at[0].color for t in at) and at[0].color != moving_color

    def can_capture(self, path_index: int, moving_color: str) -> bool:
        """Can capture if one token of different color and not safe square."""
        if path_index in SAFE_PATH_INDEXES:
            return False
        at = self.get_tokens_at_path(path_index)
        if len(at) != 1:
            return False
        return at[0].color != moving_color


class GameEngine:
    """Ludo rules engine: valid moves, apply move, roll, win."""

    def __init__(self, player_count: int = 4):
        self.player_count = min(4, max(2, player_count))
        self.active_colors = list(
            ACTIVE_COLORS_BY_COUNT.get(self.player_count, COLORS[: self.player_count])
        )
        self.color_index = {c: i for i, c in enumerate(self.active_colors)}

    def new_game(self) -> GameEngineState:
        """Create initial state: all tokens in yard."""
        tokens: list[TokenState] = []
        for color in self.active_colors:
            for ti in range(TOKENS_PER_PLAYER):
                tokens.append(
                    TokenState(
                        color=color,
                        token_index=ti,
                        kind=TokenPositionKind.YARD,
                    )
                )
        return GameEngineState(
            current_player_index=0,
            tokens=tokens,
            player_count=self.player_count,
            active_colors=self.active_colors,
        )

    def roll_dice(self) -> int:
        return random.randint(1, 6)

    def valid_moves(self, state: GameEngineState, roll: int) -> list[tuple[str, int]]:
        """
        Returns list of (color, token_index) that can move with this roll.
        Token index 0-3 for that color.
        """
        if state.winner_index is not None:
            return []
        color = state.active_colors[state.current_player_index]
        tokens = self.get_tokens_by_color(state, color)
        moves: list[tuple[str, int]] = []

        for t in tokens:
            if self._can_move_token(state, t, roll):
                moves.append((t.color, t.token_index))

        return moves

    def _can_move_token(self, state: GameEngineState, token: TokenState, roll: int) -> bool:
        if token.kind == TokenPositionKind.YARD:
            return roll == 6
        if token.kind == TokenPositionKind.PATH:
            return self._can_advance_on_path(state, token, roll)
        if token.kind == TokenPositionKind.HOME:
            return self._can_advance_in_home(token, roll)
        return False

    def _can_advance_on_path(self, state: GameEngineState, token: TokenState, roll: int) -> bool:
        assert token.path_index is not None
        start = START_PATH_INDEX[token.color]
        entrance = HOME_ENTRANCE_PATH[token.color]
        # Normalize position as steps from start (0..51)
        steps = (token.path_index - start) % PATH_LENGTH
        new_steps = steps + roll
        if new_steps >= PATH_LENGTH:
            # Would go past lap; need to enter home
            into_home = new_steps - PATH_LENGTH
            if into_home <= 4:
                return True  # can enter home
            return False  # overshoot
        new_path = (start + new_steps) % PATH_LENGTH
        if state.is_blocked(new_path, token.color):
            return False
        return True

    def _can_advance_in_home(self, token: TokenState, roll: int) -> bool:
        assert token.home_index is not None
        next_idx = token.home_index + roll
        return next_idx <= 4

    def get_tokens_by_color(self, state: GameEngineState, color: str) -> list[TokenState]:
        return [t for t in state.tokens if t.color == color]

    def get_move_destination(
        self,
        state: GameEngineState,
        token: TokenState,
        roll: int,
    ) -> Optional[tuple[TokenPositionKind, Optional[int], Optional[int]]]:
        """Return expected destination (kind, path_index, home_index) for a move."""
        if not self._can_move_token(state, token, roll):
            return None
        if token.kind == TokenPositionKind.YARD:
            return (TokenPositionKind.PATH, START_PATH_INDEX[token.color], None)
        if token.kind == TokenPositionKind.PATH:
            assert token.path_index is not None
            start = START_PATH_INDEX[token.color]
            steps = (token.path_index - start) % PATH_LENGTH
            new_steps = steps + roll
            if new_steps >= PATH_LENGTH:
                into_home = new_steps - PATH_LENGTH
                if into_home <= 4:
                    return (TokenPositionKind.HOME, None, into_home)
                return None
            new_path = (start + new_steps) % PATH_LENGTH
            if state.is_blocked(new_path, token.color):
                return None
            return (TokenPositionKind.PATH, new_path, None)
        if token.kind == TokenPositionKind.HOME:
            assert token.home_index is not None
            next_idx = token.home_index + roll
            if next_idx <= 4:
                return (TokenPositionKind.HOME, None, next_idx)
        return None

    def apply_move(
        self,
        state: GameEngineState,
        color: str,
        token_index: int,
        roll: int,
    ) -> MoveResult:
        """
        Apply move for token (color, token_index). Assumes move is valid.
        Returns MoveResult; does not mutate state (caller must build new state).
        """
        token = next(
            (t for t in state.tokens if t.color == color and t.token_index == token_index),
            None,
        )
        if not token or not self._can_move_token(state, token, roll):
            return MoveResult(moved=False, extra_turn=False, message="Invalid move")

        if token.kind == TokenPositionKind.YARD:
            return self._apply_leave_yard(state, token, roll)
        if token.kind == TokenPositionKind.PATH:
            return self._apply_path_move(state, token, roll)
        return self._apply_home_move(state, token, roll)

    def _apply_leave_yard(
        self,
        state: GameEngineState,
        token: TokenState,
        roll: int,
    ) -> MoveResult:
        # Move to start path index
        new_token = TokenState(
            color=token.color,
            token_index=token.token_index,
            kind=TokenPositionKind.PATH,
            path_index=START_PATH_INDEX[token.color],
        )
        self._replace_token(state, token, new_token)
        return MoveResult(
            moved=True,
            extra_turn=(roll == 6),
            message="Token entered the track!",
        )

    def _apply_path_move(
        self,
        state: GameEngineState,
        token: TokenState,
        roll: int,
    ) -> MoveResult:
        assert token.path_index is not None
        start = START_PATH_INDEX[token.color]
        entrance = HOME_ENTRANCE_PATH[token.color]
        steps = (token.path_index - start) % PATH_LENGTH
        new_steps = steps + roll
        captured: Optional[str] = None

        if new_steps >= PATH_LENGTH:
            into_home = new_steps - PATH_LENGTH
            if into_home <= 4:
                new_token = TokenState(
                    color=token.color,
                    token_index=token.token_index,
                    kind=TokenPositionKind.HOME,
                    home_index=into_home,
                )
                self._replace_token(state, token, new_token)
                return MoveResult(
                    moved=True,
                    extra_turn=(roll == 6),
                    message="Moved into home column.",
                )
            return MoveResult(moved=False, extra_turn=False, message="Cannot overshoot home")

        new_path = (start + new_steps) % PATH_LENGTH
        # Capture: send opponent at new_path back to yard
        if state.can_capture(new_path, token.color):
            other = state.get_tokens_at_path(new_path)[0]
            captured = other.color
            yard_token = TokenState(
                color=other.color,
                token_index=other.token_index,
                kind=TokenPositionKind.YARD,
            )
            self._replace_token(state, other, yard_token)

        new_token = TokenState(
            color=token.color,
            token_index=token.token_index,
            kind=TokenPositionKind.PATH,
            path_index=new_path,
        )
        self._replace_token(state, token, new_token)
        return MoveResult(
            moved=True,
            extra_turn=(roll == 6),
            captured=captured,
            message="Moved on path." + (" Captured!" if captured else ""),
        )

    def _apply_home_move(
        self,
        state: GameEngineState,
        token: TokenState,
        roll: int,
    ) -> MoveResult:
        assert token.home_index is not None
        next_idx = token.home_index + roll
        if next_idx > 4:
            return MoveResult(moved=False, extra_turn=False, message="Must roll exact to finish")
        new_token = TokenState(
            color=token.color,
            token_index=token.token_index,
            kind=TokenPositionKind.HOME,
            home_index=next_idx,
        )
        self._replace_token(state, token, new_token)
        won = self._check_winner(state, token.color)
        if won:
            state.winner_index = self.color_index[token.color]
        return MoveResult(
            moved=True,
            extra_turn=(roll == 6),
            message="Moved in home." + (" Winner!" if won else ""),
        )

    def _replace_token(
        self,
        state: GameEngineState,
        old_token: TokenState,
        new_token: TokenState,
    ) -> None:
        for i, t in enumerate(state.tokens):
            if t.color == old_token.color and t.token_index == old_token.token_index:
                state.tokens[i] = new_token
                return

    def _check_winner(self, state: GameEngineState, color: str) -> bool:
        home_tokens = [t for t in state.tokens if t.color == color and t.kind == TokenPositionKind.HOME]
        return len(home_tokens) == TOKENS_PER_PLAYER and all(
            t.home_index == 4 for t in home_tokens
        )


def state_to_dict(state: GameEngineState) -> dict:
    """Serialize engine state for API/JSON."""
    tokens_data = []
    for t in state.tokens:
        tokens_data.append({
            "color": t.color,
            "token_index": t.token_index,
            "kind": t.kind.value,
            "path_index": t.path_index,
            "home_index": t.home_index,
        })
    return {
        "current_player_index": state.current_player_index,
        "last_roll": state.last_roll,
        "has_rolled": state.has_rolled,
        "tokens": tokens_data,
        "winner_index": state.winner_index,
        "player_count": state.player_count,
        "active_colors": state.active_colors,
    }


def dict_to_state(data: dict) -> GameEngineState:
    """Deserialize engine state from API/JSON."""
    tokens = []
    for t in data.get("tokens", []):
        tokens.append(
            TokenState(
                color=t["color"],
                token_index=t["token_index"],
                kind=TokenPositionKind(t["kind"]),
                path_index=t.get("path_index"),
                home_index=t.get("home_index"),
            )
        )
    player_count = data.get("player_count", 4)
    active_colors = data.get(
        "active_colors",
        list(ACTIVE_COLORS_BY_COUNT.get(player_count, COLORS[:player_count])),
    )
    return GameEngineState(
        current_player_index=data.get("current_player_index", 0),
        last_roll=data.get("last_roll"),
        has_rolled=data.get("has_rolled", False),
        tokens=tokens,
        winner_index=data.get("winner_index"),
        player_count=player_count,
        active_colors=active_colors,
    )


def advance_turn(state: GameEngineState) -> None:
    """Advance to next player and clear roll."""
    state.current_player_index = (state.current_player_index + 1) % len(state.active_colors)
    state.last_roll = None
    state.has_rolled = False
