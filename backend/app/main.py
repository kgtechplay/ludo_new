from fastapi import FastAPI

from app.api.routes import games, health

app = FastAPI(title="Ludo API")

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(games.router, prefix="/games", tags=["games"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint for quick verification."""
    return {"status": "ok", "service": "ludo-api"}
