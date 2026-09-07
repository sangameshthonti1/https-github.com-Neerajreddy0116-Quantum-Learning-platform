"""Application factory used by Uvicorn and tests."""

from fastapi import FastAPI

from fastapi.responses import RedirectResponse

from app.api.router import api_router
from app.core.config import Settings
from app.core.cors import ApiCORSMiddleware


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    app = FastAPI(
        title=settings.api_title,
        version="0.1.0",
        description="Foundation for the Quantum Learning Platform API.",
    )
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            ApiCORSMiddleware,
            allow_origins=settings.cors_origins,
        )

    app.include_router(api_router)

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    return app
