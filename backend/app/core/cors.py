"""CORS method permissions scoped to the implemented API routes."""

from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class ApiCORSMiddleware:
    def __init__(self, app: ASGIApp, allow_origins: list[str]) -> None:
        self.read_only = CORSMiddleware(
            app,
            allow_origins=allow_origins,
            allow_credentials=False,
            allow_methods=["GET"],
            allow_headers=[],
        )
        self.simulation = CORSMiddleware(
            app,
            allow_origins=allow_origins,
            allow_credentials=False,
            allow_methods=["POST"],
            allow_headers=["Content-Type"],
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Adding a write endpoint must not grant POST preflights to health/docs.
        middleware = (
            self.simulation
            if scope["type"] == "http" and scope["path"] in {"/api/simulate", "/api/simulate/trace"}
            else self.read_only
        )
        await middleware(scope, receive, send)
