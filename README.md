# Twisted Ludo

Twisted Ludo is a full-stack online Ludo app with account-based history, resumable multiplayer matches, real-time updates over WebSockets, and a responsive React UI for laptop, tablet, and mobile browsers.

## Current Product Snapshot

- 2-player online play is the primary supported mode
- 4-player creation is currently disabled in the UI
- Logged-out users see a single centered `Sign In` entry point
- Signed-in users can create a game, manage `My Games`, and sign out
- New games open into a lobby popup with:
  - copy-link icon
  - close icon
  - player readiness
- Host clicking `Start Game` marks the host ready and returns them to `My Games`
- Invited players clicking `Start Game` either:
  - remain in the waiting lobby if the host is not ready yet, or
  - go straight to the game board if their click starts the match
- `My Games` shows waiting, in-progress, paused, completed, and aborted games
- Game IDs are the primary open/rejoin action in `My Games`
- Paused games require all players to resume before becoming active again
- Signed-in players can reclaim persisted seats from saved game URLs

## Repo Layout

- `frontend/`: React + Vite + TypeScript + Tailwind client
- `backend/`: FastAPI + SQLAlchemy backend with WebSocket updates
- `docs/`: product, structure, and implementation docs

## Core Flows

### Home

- Logged out:
  - centered `Sign In` button
  - join-by-link flow
- Logged in:
  - `Create 2-Player Game`
  - top-right `My Games`
  - top-right `Sign Out`

### Lobby

- Opening a newly created game shows the lobby popup
- The lobby includes:
  - close icon
  - share-link copy icon
  - player readiness list
- Closing the lobby returns the user to home
- The game remains available in `My Games`

### My Games

- Full-page overlay from the home page
- Responsive:
  - mobile card layout
  - desktop table layout
- Statuses:
  - `Waiting`
  - `In Progress`
  - `Paused`
  - `Completed`
  - `Aborted`
- Actions:
  - click game ID to open/rejoin waiting, active, or paused games
  - copy-link icon for active/paused games
  - delete icon for creator/host only

### Pause / Resume

- Signed-in players leaving an active game are auto-paused when possible
- Guests are prompted to sign in before pausing/leaving if they want the game saved to their account
- Resuming a paused game requires all players to click resume
- After one player resumes, `My Games` shows that row as `Waiting` for that player

## Tech Stack

### Frontend

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- React Router DOM

### Backend

- FastAPI
- SQLAlchemy async
- PostgreSQL or SQLite
- JWT auth
- WebSockets

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.13 recommended for local backend work on Windows

### Backend

Windows PowerShell:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Environment Variables

### Frontend

Create a local-only env file such as `frontend/.env` or `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8080
```

All frontend HTTP and WebSocket traffic is derived from `VITE_API_BASE_URL`.

### Backend

Backend env vars live in `backend/.env`.

Typical local example:

```env
DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
DB_AUTO_CREATE=true
APP_ENV=development
JWT_SECRET=change-me
CORS_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174
```

Notes:

- `APP_ENV` is currently a useful environment marker for development vs production intent
- `CORS_ORIGINS` is comma-separated and used in both local and hosted environments
- local fallback DB behavior still exists, but PostgreSQL is preferred for persistence testing

## Default Local URLs

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8080`
- Backend docs: `http://127.0.0.1:8080/docs`

## Deployment Notes

Recommended Render-style split:

1. Backend as a Web Service
2. Frontend as a Static Site

Important production settings:

- frontend `VITE_API_BASE_URL=https://<backend-service>`
- backend `DATABASE_URL=<managed-postgres-url>`
- backend `JWT_SECRET=<strong-secret>`
- backend `APP_ENV=production`
- backend `CORS_ORIGINS=https://<frontend-site>,https://<backend-site>`

## Documentation

- [Project Structure](docs/STRUCTURE.md)
- [Implementation Guide](docs/Implementation%20Guide.md)
- [Twisted Ludo PRD](docs/TwistedLudo%20PRD.md)
