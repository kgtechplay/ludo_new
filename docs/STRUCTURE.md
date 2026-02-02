# Project structure and file details

```
.
├── README.md
├── .gitignore
├── docs/
│   └── STRUCTURE.md
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── games.py
│   │   │       └── health.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── game.py
│   │   │   └── player.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── game.py
│   │   │   └── player.py
│   │   └── services/
│   │       ├── __init__.py
│   │       └── game_engine.py
│   └── tests/
│       └── __init__.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.cjs
    ├── tailwind.config.cjs
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── index.css
        ├── main.tsx
        ├── api/
        │   └── client.ts
        ├── components/
        │   ├── Board.tsx
        │   ├── Dice.tsx
        │   ├── PlayerPanel.tsx
        │   └── Token.tsx
        └── types/
            └── game.ts
```

## File details

### Root

- `README.md`: High-level setup and quick-start instructions for both services.
- `.gitignore`: Ignores Python virtualenvs, Node artifacts, and build outputs.
- `docs/STRUCTURE.md`: This file; the canonical reference for the scaffold layout.

### Backend

- `backend/.env.example`: Example environment variables for Postgres connectivity.
- `backend/requirements.txt`: Python dependencies for FastAPI, SQLAlchemy, and Postgres.
- `backend/app/__init__.py`: Marks the app module as a Python package.
- `backend/app/main.py`: FastAPI app factory, router registration, and startup hooks.
- `backend/app/api/__init__.py`: API package marker.
- `backend/app/api/routes/__init__.py`: Router aggregator for API endpoints.
- `backend/app/api/routes/health.py`: Health check endpoint for uptime monitoring.
- `backend/app/api/routes/games.py`: Placeholder endpoints for game creation and state.
- `backend/app/core/__init__.py`: Core package marker.
- `backend/app/core/config.py`: Pydantic settings for environment configuration.
- `backend/app/core/database.py`: SQLAlchemy engine/session setup for Postgres.
- `backend/app/models/__init__.py`: SQLAlchemy model package marker.
- `backend/app/models/game.py`: Game table definition (metadata for sessions).
- `backend/app/models/player.py`: Player table definition (user info & color).
- `backend/app/schemas/__init__.py`: Pydantic schema package marker.
- `backend/app/schemas/game.py`: Request/response models for game data.
- `backend/app/schemas/player.py`: Request/response models for player data.
- `backend/app/services/__init__.py`: Service package marker.
- `backend/app/services/game_engine.py`: Pure rules engine placeholder for Ludo logic.
- `backend/tests/__init__.py`: Test package marker for future tests.

### Frontend

- `frontend/index.html`: Vite HTML entry point.
- `frontend/package.json`: Frontend scripts and dependencies (React, Vite, Tailwind).
- `frontend/postcss.config.cjs`: PostCSS setup for Tailwind.
- `frontend/tailwind.config.cjs`: Tailwind configuration and content paths.
- `frontend/tsconfig.json`: TypeScript config for the app.
- `frontend/tsconfig.node.json`: TypeScript config for Vite tooling.
- `frontend/vite.config.ts`: Vite config with React plugin.
- `frontend/src/main.tsx`: React entry point and Tailwind import.
- `frontend/src/index.css`: Tailwind base styles and custom tokens.
- `frontend/src/App.tsx`: Main UI layout with board and side panel.
- `frontend/src/api/client.ts`: Fetch wrapper for backend API calls.
- `frontend/src/components/Board.tsx`: Board layout placeholder for grid rendering.
- `frontend/src/components/Dice.tsx`: Dice roll UI component placeholder.
- `frontend/src/components/PlayerPanel.tsx`: Player info and turn indicator UI.
- `frontend/src/components/Token.tsx`: Token UI component placeholder.
- `frontend/src/types/game.ts`: Shared front-end types for game state.
