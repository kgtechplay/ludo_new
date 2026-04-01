from contextlib import asynccontextmanager
import asyncio
import os

if os.name == "nt":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import games, health
from app.api.routes import auth as auth_routes
from app.core.config import settings
from app.core.database import Base, engine
import app.models.game  # noqa: F401
import app.models.user  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Ludo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(games.router, prefix="/games", tags=["games"])
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])


@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "ludo-api"}
