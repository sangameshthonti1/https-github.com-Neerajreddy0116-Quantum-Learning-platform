"""Small-process admission limits for an unauthenticated public demonstration."""

from collections import deque
from time import monotonic

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class _BodyTooLarge(Exception):
    pass


def _error(
    code: str, message: str, status: int, *, retry_after: str | None = None
) -> JSONResponse:
    headers = {"Cache-Control": "no-store"}
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


class PublicApiGuard:
    """Bound aggregate public API work without trusting client IP headers.

    Limits are deliberately global per process. This is predictable behind a
    hosted reverse proxy and cannot be bypassed by spoofing forwarding headers.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_body_bytes: int,
        max_concurrency: int,
        requests_per_minute: int,
    ) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.max_concurrency = max_concurrency
        self.requests_per_minute = requests_per_minute
        self.active = 0
        self.admitted: deque[float] = deque()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/"):
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        bounded_work = method in {"POST", "PUT", "PATCH", "DELETE"}
        if not bounded_work:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                if int(raw_length) > self.max_body_bytes:
                    await self._too_large(scope, receive, send)
                    return
            except ValueError:
                pass

        now = monotonic()
        while self.admitted and self.admitted[0] <= now - 60:
            self.admitted.popleft()
        if len(self.admitted) >= self.requests_per_minute:
            response = _error(
                "public_rate_limited",
                "This public demo reached its request limit. Please wait a minute and retry.",
                429,
                retry_after="60",
            )
            await response(scope, receive, send)
            return
        if self.active >= self.max_concurrency:
            response = _error(
                "public_service_busy",
                "The public quantum service is busy. Please retry shortly.",
                429,
                retry_after="5",
            )
            await response(scope, receive, send)
            return

        self.admitted.append(now)
        self.active += 1
        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    raise _BodyTooLarge
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except _BodyTooLarge:
            if not response_started:
                await self._too_large(scope, receive, send)
        finally:
            self.active -= 1

    async def _too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = _error(
            "public_body_too_large",
            "Keep public API requests under the configured body limit.",
            413,
        )
        await response(scope, receive, send)
