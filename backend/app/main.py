from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import games, health

app = FastAPI(title="Ludo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(games.router, prefix="/games", tags=["games"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint for quick verification."""
    return {"status": "ok", "service": "ludo-api"}
