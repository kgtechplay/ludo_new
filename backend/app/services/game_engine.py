from dataclasses import dataclass


@dataclass
class MoveResult:
    """Represents a resolved move on the board."""

    moved: bool
    extra_turn: bool
    message: str


class GameEngine:
    """Pure rules engine placeholder for Ludo gameplay logic."""

    def resolve_roll(self, roll: int) -> MoveResult:
        if roll == 6:
            return MoveResult(moved=True, extra_turn=True, message="Rolled a six!")
        return MoveResult(moved=True, extra_turn=False, message=f"Rolled a {roll}.")
