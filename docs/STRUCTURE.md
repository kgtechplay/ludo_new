# Project Structure

This document maps the current Twisted Ludo repository and the main responsibilities of each area.

## Top Level

```text
.
|- backend/
|- docs/
|- frontend/
|- .gitignore
|- nixpacks.toml
|- railway.json
|- README.md
|- start.sh
```

## Backend

```text
backend/
|- app/
|  |- api/
|  |  |- routes/
|  |  |  |- auth.py
|  |  |  |- games.py
|  |  |  |- health.py
|  |- core/
|  |  |- config.py
|  |  |- database.py
|  |- models/
|  |  |- game.py
|  |  |- user.py
|  |- schemas/
|  |  |- auth.py
|  |  |- game.py
|  |- services/
|  |  |- auth_service.py
|  |  |- connection_manager.py
|  |  |- game_engine.py
|  |- main.py
|- .env.example
|- requirements.txt
```

### Important Backend Files

- `backend/app/main.py`
  - FastAPI app setup
  - CORS middleware
  - startup table creation
- `backend/app/core/config.py`
  - env-driven settings
  - DB URL normalization
  - `CORS_ORIGINS` parsing
- `backend/app/core/database.py`
  - async SQLAlchemy engine and session
- `backend/app/api/routes/auth.py`
  - register, login, current-user
  - `GET /auth/me/games`
  - creator-hosted delete flow for games
- `backend/app/api/routes/games.py`
  - create/join/lobby/ready/get state
  - roll/move/pass/pause/resume/reset
  - claim seat
  - DB rehydration of saved games
  - WebSocket sync and roll events
- `backend/app/models/user.py`
  - persisted user accounts
- `backend/app/models/game.py`
  - persisted game rows, player-user bindings, winner metadata, serialized engine state
- `backend/app/services/game_engine.py`
  - Ludo rules engine and state transitions
- `backend/app/services/connection_manager.py`
  - WebSocket room registry and fanout

### Backend Runtime Model

- Live lobbies still exist in in-memory `_lobbies`
- Important game state is also persisted to the database
- Saved `active`, `paused`, and `completed` games can be restored into memory when needed

## Frontend

```text
frontend/
|- src/
|  |- api/
|  |  |- client.ts
|  |- components/
|  |  |- AuthModal.tsx
|  |  |- Board.tsx
|  |  |- Dice.tsx
|  |  |- LobbyView.tsx
|  |  |- MyGames.tsx
|  |  |- PlayerPanel.tsx
|  |  |- Token.tsx
|  |- constants/
|  |  |- board.ts
|  |- context/
|  |  |- AuthContext.tsx
|  |- hooks/
|  |  |- useGameSocket.ts
|  |  |- usePlayerIdentity.ts
|  |- pages/
|  |  |- GamePage.tsx
|  |  |- HomePage.tsx
|  |- types/
|  |  |- game.ts
|  |- App.tsx
|  |- ErrorBoundary.tsx
|  |- index.css
|  |- main.tsx
|- index.html
|- package.json
|- vite.config.ts
```

### Important Frontend Files

- `frontend/src/pages/HomePage.tsx`
  - landing page
  - signed-in create flow
  - top-right `My Games` and `Sign Out`
  - full-page `My Games` overlay
- `frontend/src/pages/GamePage.tsx`
  - boot flow for waiting lobby, active game, paused game, stale game, and auth reclaim
  - leave/pause/save flow
  - resume handling
  - dice animation state
- `frontend/src/components/LobbyView.tsx`
  - waiting-room popup
  - close icon
  - copy-link icon
  - player-ready state
- `frontend/src/components/MyGames.tsx`
  - responsive mobile cards + desktop table
  - clickable game ids
  - copy/delete icon actions
  - stale-game cleanup
- `frontend/src/components/Dice.tsx`
  - roll button state
  - pause/reset/resume controls
- `frontend/src/components/Board.tsx`
  - board render and token interaction
- `frontend/src/components/PlayerPanel.tsx`
  - turn and player summary
- `frontend/src/context/AuthContext.tsx`
  - auth token and current-user state
- `frontend/src/hooks/useGameSocket.ts`
  - socket sync for lobby/game/roll events
- `frontend/src/hooks/usePlayerIdentity.ts`
  - local player identity persistence
  - resume-waiting markers
- `frontend/src/api/client.ts`
  - REST helpers
  - `VITE_API_BASE_URL` driven HTTP + WebSocket URLs

## Docs

```text
docs/
|- Implementation Guide.md
|- STRUCTURE.md
|- TwistedLudo PRD.md
```

### Doc Roles

- `README.md`
  - repo overview and setup
- `docs/STRUCTURE.md`
  - file map and responsibilities
- `docs/Implementation Guide.md`
  - current architecture and workflow behavior
- `docs/TwistedLudo PRD.md`
  - product goals and intended experience

## Local-Only Files To Keep Out Of Git

- `backend/.env`
- `frontend/.env`
- `frontend/.env.local`
- `backend/.venv/`
- `frontend/node_modules/`
- local logs and scratch files

## Deployment Helpers

- `start.sh`
  - backend startup entry for hosted environments
- `nixpacks.toml`
  - build config for Nixpacks-style deploys
- `railway.json`
  - Railway deployment configuration
