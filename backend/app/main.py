"""Application factory used by Uvicorn and tests."""

from contextlib import asynccontextmanager
from fastapi import FastAPI

from fastapi.responses import RedirectResponse

from app.api.router import api_router
from app.core.config import Settings
from app.core.cors import ApiCORSMiddleware
from app.core.tutor_config import TutorSettings
from app.services.tutor import TutorService
from app.services.variational_jobs import VariationalJobs


def create_app(settings: Settings | None = None, *, tutor_settings: TutorSettings | None = None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    jobs = VariationalJobs()

    @asynccontextmanager
    async def lifespan(application):
        try:
            yield
        finally:
            await application.state.variational_jobs.close()

    app = FastAPI(
        title=settings.api_title,
        version="0.1.0",
        description="Foundation for the Quantum Learning Platform API.",
        lifespan=lifespan,
    )
    app.state.variational_jobs = jobs
    app.state.settings = settings
    app.state.tutor_service = TutorService(tutor_settings if tutor_settings is not None else TutorSettings())

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
