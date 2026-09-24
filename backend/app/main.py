"""Application factory used by Uvicorn and tests."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from app.api.router import api_router
from app.core.config import Settings
from app.core.cors import ApiCORSMiddleware
from app.core.public_guard import PublicApiGuard
from app.core.tutor_config import TutorSettings
from app.services.tutor import TutorService
from app.services.variational_jobs import VariationalJobs


def create_app(
    settings: Settings | None = None, *, tutor_settings: TutorSettings | None = None
) -> FastAPI:
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
    app.state.tutor_service = TutorService(
        tutor_settings if tutor_settings is not None else TutorSettings()
    )

    if settings.cors_origins:
        app.add_middleware(
            ApiCORSMiddleware,
            allow_origins=settings.cors_origins,
        )
    if settings.public_mode:
        app.add_middleware(
            PublicApiGuard,
            max_body_bytes=settings.public_max_body_bytes,
            max_concurrency=settings.public_max_concurrency,
            requests_per_minute=settings.public_requests_per_minute,
        )

    app.include_router(api_router)

    if settings.frontend_dist is None:
        if settings.public_mode:
            raise RuntimeError("Public mode requires a built frontend index.")

        @app.get("/", include_in_schema=False)
        async def root() -> RedirectResponse:
            return RedirectResponse(url="/docs")
    else:
        frontend_root = settings.frontend_dist.resolve()
        frontend_index = frontend_root / "index.html"
        if not frontend_index.is_file():
            raise RuntimeError(f"Built frontend index not found at {frontend_index}")

        def public_file(path: str) -> Path | None:
            candidate = (frontend_root / path).resolve()
            try:
                candidate.relative_to(frontend_root)
            except ValueError:
                return None
            return candidate if candidate.is_file() else None

        @app.get("/", include_in_schema=False)
        async def frontend_root_page() -> FileResponse:
            return FileResponse(frontend_index, headers={"Cache-Control": "no-cache"})

        @app.get("/{path:path}", include_in_schema=False)
        async def frontend_page(path: str) -> FileResponse:
            if (
                path == "api"
                or path.startswith(("api/", "docs/", "redoc/"))
                or path == "openapi.json"
            ):
                raise HTTPException(status_code=404)
            candidate = public_file(path)
            if candidate is not None:
                cache = (
                    "public, max-age=31536000, immutable"
                    if path.startswith("assets/")
                    else "public, max-age=3600"
                )
                return FileResponse(candidate, headers={"Cache-Control": cache})
            return FileResponse(frontend_index, headers={"Cache-Control": "no-cache"})

    return app
