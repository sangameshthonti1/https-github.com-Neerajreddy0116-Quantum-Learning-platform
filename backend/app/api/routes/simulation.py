"""Validated HTTP boundary for local quantum simulation."""

import logging

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.schemas.simulation import (
    ExecutionErrorResponse,
    SimulationRequest,
    SimulationResponse,
    ValidationErrorResponse,
    ValidationIssue,
)
from app.services.qiskit_simulator import SimulationExecutionError, simulate_circuit

logger = logging.getLogger(__name__)


class SimulationRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def validated_handler(request: Request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                # Do not echo arbitrary request bodies or exception objects into JSON.
                error = ValidationErrorResponse(
                    detail=[
                        ValidationIssue(loc=list(item["loc"]), msg=item["msg"], type=item["type"])
                        for item in exc.errors()
                    ]
                )
                return JSONResponse(status_code=422, content=error.model_dump())

        return validated_handler


router = APIRouter(tags=["simulation"], route_class=SimulationRoute)


@router.post(
    "/simulate",
    response_model=SimulationResponse,
    summary="Simulate a small ideal quantum circuit",
    responses={
        422: {"model": ValidationErrorResponse},
        500: {"model": ExecutionErrorResponse},
    },
)
def simulate(request: SimulationRequest) -> SimulationResponse | JSONResponse:
    # FastAPI runs synchronous handlers in its worker pool, not the async event loop.
    try:
        return simulate_circuit(request)
    except SimulationExecutionError:
        logger.exception("Local quantum simulation failed")
        return JSONResponse(
            status_code=500, content=ExecutionErrorResponse().model_dump()
        )
