"""Server-owned algorithms; synchronous handlers share the existing worker-pool boundary."""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.routes.simulation import SimulationRoute
from app.schemas.algorithms import AlgorithmDefinition, AlgorithmRequest, AlgorithmRun, CatalogEntry
from app.schemas.simulation import ExecutionErrorResponse, ValidationErrorResponse
from app.services.algorithm_catalog import CATALOG
from app.services.algorithms import build_algorithm, run_algorithm
from app.services.qiskit_simulator import SimulationExecutionError

router = APIRouter(prefix="/algorithms", tags=["algorithms"], route_class=SimulationRoute)
logger = logging.getLogger(__name__)


@router.get("", response_model=list[CatalogEntry])
def catalog():
    return CATALOG


@router.post("/build", response_model=AlgorithmDefinition, responses={422: {"model": ValidationErrorResponse}})
def build(request: AlgorithmRequest):
    return build_algorithm(request)


@router.post("/run", response_model=AlgorithmRun,
             responses={422: {"model": ValidationErrorResponse}, 503: {"model": ExecutionErrorResponse}})
def run(request: AlgorithmRequest):
    try:
        return run_algorithm(request)
    except SimulationExecutionError:
        logger.exception("Algorithm execution failed")
        return JSONResponse(status_code=503, content=ExecutionErrorResponse().model_dump())
