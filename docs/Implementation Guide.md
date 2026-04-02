# Implementation Guide

This guide explains how Twisted Ludo works today so the current codebase, runtime behavior, and UI flows are easier to maintain.

## 1. Product Overview

Twisted Ludo is a web-based multiplayer Ludo app with:

- account sign-in and sign-up
- resumable multiplayer sessions
- real-time board updates over WebSockets
- database-backed game history
- responsive UI for laptop, tablet, and mobile browsers

Current product emphasis:

- 2-player online play
- account-backed recovery and resume
- `My Games` as the central place to reopen waiting, active, and paused matches

Important current constraint:

- 4-player creation is disabled in the UI for now

## 2. Frontend Architecture

### 2.1 App Shell

Key files:

- `frontend/src/App.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/GamePage.tsx`

### 2.2 Home Page

`HomePage.tsx` is responsible for:

- single centered sign-in entry point for logged-out users
- signed-in create-game actions
- top-right `My Games`
- top-right `Sign Out`
- full-page `My Games` overlay

Current home behavior:

- `Create 2-Player Game` is enabled
- `Create 4-Player Game` is disabled
- logged-out users can still join by link

### 2.3 Auth State

Key file:

- `frontend/src/context/AuthContext.tsx`

Responsibilities:

- login/register/logout
- store JWT token locally
- fetch current user from `/auth/me`
- expose `user`, `token`, and auth methods to the app

### 2.4 API Layer

Key file:

- `frontend/src/api/client.ts`

Responsibilities:

- all frontend HTTP requests
- all WebSocket URL generation
- token-aware request headers
- player-id request headers

Current rule:

- all frontend API traffic is derived from `VITE_API_BASE_URL`

That includes:

- auth endpoints
- game endpoints
- WebSocket endpoint base

### 2.5 Local Player Identity

Key file:

- `frontend/src/hooks/usePlayerIdentity.ts`

Responsibilities:

- store per-game browser identity
- reconnect an existing browser to the same seat
- keep local markers such as "this player already clicked resume"

### 2.6 Real-Time Updates

Key file:

- `frontend/src/hooks/useGameSocket.ts`

Responsibilities:

- receive lobby updates
- receive game-state updates
- receive pause/resume events
- receive opponent rolling start/stop events

### 2.7 Game Page Boot Flow

Key file:

- `frontend/src/pages/GamePage.tsx`

`GamePage` now drives the app through explicit boot states rather than relying only on socket timing.

Important boot phases:

- `loading`
- `ready`
- `needs_auth`
- `stale`

Main outcomes:

- waiting lobby
- active board
- paused overlay
- sign-in-to-reclaim prompt
- stale-game screen

### 2.8 Lobby UI

Key file:

- `frontend/src/components/LobbyView.tsx`

Current lobby behavior:

- close icon returns to home
- copy-link icon copies the canonical game URL
- player readiness is shown inline
- host clicking `Start Game` marks the host ready and returns to `My Games`
- invited player clicking `Start Game`:
  - waits in the lobby if the host is not ready
  - loads the board immediately if that click starts the match
- once a user is already ready, the start button is hidden when the lobby is reopened

### 2.9 My Games

Key file:

- `frontend/src/components/MyGames.tsx`

Current behavior:

- full-page overlay
- mobile card layout
- desktop table layout
- clickable game ID for waiting/active/paused games
- copy-link icon for active/paused games
- delete icon for creator/host only
- stale-game popup cleanup

Displayed statuses:

- `Waiting`
- `In Progress`
- `Paused`
- `Completed`
- `Aborted`

Special case:

- if a paused player already clicked resume, that row appears as `Waiting` for that player

## 3. Backend Architecture

### 3.1 App Setup

Key file:

- `backend/app/main.py`

Responsibilities:

- FastAPI app setup
- CORS registration
- startup table creation
- router registration

### 3.2 Configuration

Key file:

- `backend/app/core/config.py`

Current important settings:

- `DATABASE_URL`
- `DB_AUTO_CREATE`
- `APP_ENV`
- `JWT_SECRET`
- `CORS_ORIGINS`

Current CORS behavior:

- `CORS_ORIGINS` is comma-separated
- the same env-driven model is used locally and in hosted environments

### 3.3 Authentication

Key files:

- `backend/app/api/routes/auth.py`
- `backend/app/services/auth_service.py`

Responsibilities:

- register
- login
- current-user lookup
- JWT create/decode
- password hashing and verification

### 3.4 Live Game Transport

Key files:

- `backend/app/api/routes/games.py`
- `backend/app/services/connection_manager.py`

Runtime model:

- live lobbies are kept in `_lobbies`
- WebSockets keep connected clients in sync
- roll animation sync is broadcast with `rolling_start` and `rolling_stop`

### 3.5 Game Persistence

Key files:

- `backend/app/models/game.py`
- `backend/app/api/routes/games.py`
- `backend/app/api/routes/auth.py`

Persisted game data includes:

- `game_id`
- `player_count`
- `status`
- player 1..4 user ids
- player 1..4 display names
- winner user id
- winner display name
- serialized engine state
- timestamps

Persisted states used in practice:

- `waiting`
- `active`
- `paused`
- `completed`
- `aborted`

### 3.6 Game Restoration

Current restore behavior:

- if a game is not in memory, backend can restore saved `active`, `paused`, or `completed` games from DB
- frontend can reopen older waiting/active/paused games via `My Games`
- signed-in users can reclaim eligible saved seats

Important limitation:

- true cross-browser/device recovery is reliable for signed-in users
- guest players can only recover as long as local browser identity is still present

## 4. Current Game Flows

### 4.1 Create Game

1. Signed-in user clicks `Create 2-Player Game`
2. Backend creates a waiting lobby and returns creator identity
3. Frontend opens the lobby popup
4. User can:
   - copy the game URL
   - close the popup and return home
   - click `Start Game` to mark themselves ready

### 4.2 Start / Ready Flow

Backend route:

- `POST /games/{game_id}/ready`

Meaning in the current UI:

- `Start Game` is a ready action, not a force-start button

Current UX:

- host click:
  - marks host ready
  - returns host to `My Games`
  - row shows `Waiting`
- invited player click:
  - if host not ready yet, stays in waiting lobby
  - if host already ready, the game starts and the board loads

### 4.3 Waiting Game Reopen

Current UX:

- waiting games appear in `My Games`
- clicking the game ID reopens the lobby
- if the current user already clicked start/ready:
  - that player row shows `Ready`
  - start button is hidden

### 4.4 Active Gameplay

Primary backend routes:

- `GET /games/{game_id}`
- `POST /games/{game_id}/roll`
- `POST /games/{game_id}/move`
- `POST /games/{game_id}/pass`

Current frontend behavior:

- active player presses and releases the roll control
- roll events are mirrored to the opponent
- if no valid move exists, backend advances the turn with `pass`

### 4.5 Pause / Resume

Primary backend routes:

- `POST /games/{game_id}/pause`
- `POST /games/{game_id}/resume`

Current UX:

- signed-in players can pause and persist the game
- guests are prompted to sign in before pausing/leaving if they want durable recovery
- all players must click resume
- once one player resumes, they no longer get the resume action again
- their `My Games` row shows `Waiting` until the others resume

### 4.6 Leave Game

Current behavior:

- signed-in user leaving an active game:
  - best-effort auto-pause before navigation
- guest leaving via in-app navigation:
  - sign-in/save prompt
- browser close/refresh:
  - only native browser leave warning is possible for guests

## 5. My Games as Control Center

The intended role of `My Games` today is:

- reopen waiting lobbies
- reopen active games
- reopen paused games
- copy game URLs for reconnect/resume
- remove creator-owned games
- review completed history

This is why several flows now intentionally return to `My Games` instead of keeping the user in the popup.

## 6. Deployment Model

Current recommended deployment split:

1. backend as a web service
2. frontend as a static site

Frontend env:

```env
VITE_API_BASE_URL=https://<backend-service>
```

Backend env:

```env
DATABASE_URL=<postgres-url>
DB_AUTO_CREATE=true
APP_ENV=production
JWT_SECRET=<secret>
CORS_ORIGINS=https://<frontend-site>,https://<backend-site>
```

## 7. Local Development

### Frontend

Use a local env file:

```env
VITE_API_BASE_URL=http://127.0.0.1:8080
```

Run:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### Backend

Typical local env:

```env
APP_ENV=development
CORS_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174
```

Run:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload
```

## 8. Known Product Constraints

- 4-player creation is disabled in the UI
- guest recovery across a fresh browser/device is not fully durable
- full frontend production build can be awkward to verify in this sandbox because Vite/esbuild may hit local `EPERM` issues

## 9. Recommended Next Technical Work

- add formal DB migrations
- add automated tests for waiting-lobby and pause/resume flows
- harden roll/turn synchronization further with focused multiplayer regression tests
- decide whether the hidden backend `chance` mechanic should be removed entirely
