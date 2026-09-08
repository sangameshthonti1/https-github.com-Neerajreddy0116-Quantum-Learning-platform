"""Focused variational catalog, preview and cancellable local job lifecycle."""

from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.routes.simulation import SimulationRoute
from app.schemas.simulation import ValidationErrorResponse
from app.schemas.variational import (
    JobSnapshot, VariationalCatalog, VariationalDefinition, VariationalRequest,
)
from app.services.variational import ISING_PAIR, build_variational
from app.services.maxcut import GRAPHS
from app.services.variational_jobs import JobError

router = APIRouter(prefix="/variational", tags=["variational"], route_class=SimulationRoute)


def job_error(error: JobError):
    return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message}})


@router.get("", response_model=VariationalCatalog)
def catalog():
    return VariationalCatalog(problems=[ISING_PAIR, *GRAPHS.values()])


@router.post("/build", response_model=VariationalDefinition, responses={422: {"model": ValidationErrorResponse}})
def build(body: VariationalRequest):
    return build_variational(body)


@router.post("/jobs/{job_id}", status_code=202, response_model=JobSnapshot)
async def start(job_id: UUID, body: VariationalRequest, request: Request):
    try:
        return request.app.state.variational_jobs.start(job_id, body)
    except JobError as error:
        return job_error(error)


@router.get("/jobs/{job_id}", response_model=JobSnapshot)
async def status(job_id: UUID, request: Request):
    try:
        return request.app.state.variational_jobs.snapshot(job_id)
    except JobError as error:
        return job_error(error)


@router.delete("/jobs/{job_id}", response_model=JobSnapshot)
async def cancel(job_id: UUID, request: Request):
    try:
        return await request.app.state.variational_jobs.cancel(job_id)
    except JobError as error:
        return job_error(error)
