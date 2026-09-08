"""A bounded conversion boundary. It never invokes Qiskit or executes code."""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.routes.simulation import SimulationRoute
from app.schemas.circuit_code import CodeDiagnostic, CodeErrorResponse, ParseCodeRequest, ParseCodeResponse
from app.schemas.simulation import ValidationErrorResponse
from app.services.circuit_code import CodeError, parse_code

class CodeRoute(SimulationRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request: Request):
            # Includes JSON escaping overhead for the maximum-length source.
            # Bound even chunked requests before materializing/parsing JSON.
            chunks = bytearray()
            try:
                async with asyncio.timeout(5):
                    async for chunk in request.stream():
                        if len(chunks) + len(chunk) > 200_000:
                            return JSONResponse(status_code=413, content=CodeErrorResponse(diagnostics=[CodeDiagnostic(
                                line=1, column=1, code="body_limit", message="Keep the code request under 200,000 bytes."
                            )]).model_dump())
                        chunks.extend(chunk)
                request._body = bytes(chunks)
                return await handler(request)
            except TimeoutError:
                return JSONResponse(status_code=408, content=CodeErrorResponse(diagnostics=[CodeDiagnostic(
                    line=1, column=1, code="request_timeout", message="The code request took too long to arrive. Please retry."
                )]).model_dump())

        return bounded


router = APIRouter(tags=["circuit-code"], route_class=CodeRoute)


@router.post("/circuits/parse", response_model=ParseCodeResponse,
             responses={422: {"model": CodeErrorResponse | ValidationErrorResponse},
                        413: {"model": CodeErrorResponse}, 408: {"model": CodeErrorResponse}},
             summary="Validate the restricted OpenQASM 3 subset and return circuit data")
def parse(request: ParseCodeRequest) -> ParseCodeResponse | JSONResponse:
    try:
        return ParseCodeResponse(circuit=parse_code(request.source, request.shots, request.seed_simulator))
    except CodeError as error:
        return JSONResponse(status_code=422, content=CodeErrorResponse(diagnostics=[error.diagnostic]).model_dump())
