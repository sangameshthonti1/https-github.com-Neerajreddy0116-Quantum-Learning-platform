"""Private provider boundary, with bounded bodies and sanitized failures."""

import asyncio

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.schemas.tutor import TutorRequest, TutorResponse, TutorErrorResponse
from app.services.tutor_provider import TutorFailure

MAX_BODY_BYTES = 64 * 1024


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}}, headers={"Cache-Control": "no-store", **({"Retry-After": "60"} if status == 429 else {})})


class TutorRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request: Request):
            try:
                # Enforce even without Content-Length, before JSON/Pydantic parsing.
                chunks = bytearray()
                async with asyncio.timeout(5):
                    async for chunk in request.stream():
                        if len(chunks) + len(chunk) > MAX_BODY_BYTES:
                            return error("request_too_large", "Keep the tutor request under 64 KiB. Shorten the conversation or circuit.", 413)
                        chunks.extend(chunk)
                request._body = bytes(chunks)
                response = await handler(request)
                response.headers["Cache-Control"] = "no-store"
                return response
            except RequestValidationError as exc:
                # No echoed input or gate IDs, including in validator messages.
                issues = exc.errors()
                circuit_issue = any("circuit" in item["loc"] for item in issues)
                message = "This circuit is not supported. Use 1–3 qubits, up to 256 H/X/Z/CX gates, unique gate IDs, and in-range targets. CX needs different control and target qubits; shots must be 1–8192."
                if not circuit_issue:
                    message = "Check your tutor request: question 1–2000 characters, up to 8 recent messages (8000 characters total), a known lesson, and a step within the current circuit. Only question, mode, lessonId, circuit, selectedStep and history are accepted."
                else:
                    first = next(item for item in issues if "circuit" in item["loc"])
                    loc = first["loc"]
                    if first["type"] == "union_tag_invalid":
                        position = next((part + 1 for part in loc if isinstance(part, int)), None)
                        message = f"Gate {position or ''} is unsupported. This Lab can use H, X, Z and CX. Replace that gate with a supported operation; the circuit was not run."
                    elif "numQubits" in loc:
                        message = "This Lab supports 1–3 qubits. Reduce the qubit count and keep every gate on an available wire; the circuit was not run."
                    elif "cx" in loc:
                        message = "A CX gate needs one control and one different target qubit. Choose two available wires; the circuit was not run."
                return error("invalid_request", message, 422)
            except TutorFailure as exc:
                return error(exc.code, exc.message, exc.status)
            except TimeoutError:
                return error("request_timeout", "The request body took too long to arrive. Please retry.", 408)
        return bounded


router = APIRouter(prefix="/ai", tags=["ai-tutor"], route_class=TutorRoute)


@router.post("/tutor", response_model=TutorResponse, responses={code: {"model": TutorErrorResponse} for code in [408, 413, 422, 429, 499, 502, 503, 504]})
async def tutor(body: TutorRequest, request: Request) -> TutorResponse | JSONResponse:
    async def disconnected():
        # Starlette probes receive inside an already-cancelled AnyIO scope.
        # Checking task completion also avoids a swallowed cancellation keeping
        # the watcher alive after an immediate configuration/admission failure.
        while not task.done():
            if await request.is_disconnected():
                return
            await asyncio.sleep(0.1)

    # Best-effort cancellation closes the SDK connection and releases admission.
    # The provider may have begun billable work; cancellation is not a refund.
    task = asyncio.create_task(request.app.state.tutor_service.respond(body))
    watcher = asyncio.create_task(disconnected())
    try:
        await asyncio.wait({task, watcher}, return_when=asyncio.FIRST_COMPLETED)
        if task.done():
            return task.result()
        return error("request_cancelled", "Tutor request cancelled.", 499)
    finally:
        task.cancel()
        watcher.cancel()
        await asyncio.gather(task, watcher, return_exceptions=True)
