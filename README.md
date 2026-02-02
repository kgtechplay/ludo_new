# Ludo Game Web App

This repository contains a full-stack Ludo game scaffold built with FastAPI, Postgres, React, Vite, and Tailwind CSS.

## Project layout

- `backend/`: FastAPI service, database configuration, and game engine placeholders.
- `frontend/`: React + Vite client with a basic UI scaffold for the Ludo board and controls.
- `docs/STRUCTURE.md`: Detailed file-by-file breakdown of the scaffold.

## Quick start (local dev)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` in the `backend/` directory and update the values for your database.
