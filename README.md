# Ludo Game Web App

This repository contains a full-stack Ludo game scaffold built with FastAPI, Postgres, React, Vite, and Tailwind CSS.

## Project layout

- `backend/`: FastAPI service, database configuration, and game engine placeholders.
- `frontend/`: React + Vite client with a basic UI scaffold for the Ludo board and controls.
- `docs/STRUCTURE.md`: Detailed file-by-file breakdown of the scaffold.

## Quick start (local dev)

### Backend

A Python virtual environment is set up in `backend/.venv` with dependencies installed.

**Windows (PowerShell):**
```powershell
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload
```

**macOS / Linux:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

To recreate the venv: `python -m venv .venv` then activate and `pip install -r requirements.txt`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` in the `backend/` directory and update the values for your database.
