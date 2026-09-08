"""Server-owned catalog and simulator-backed grading in FastAPI's worker pool."""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.api.routes.simulation import SimulationRoute
from app.schemas.challenges import ChallengeDefinition, GradeRequest, GradeResponse
from app.services.challenge_catalog import CATALOG
from app.services.challenges import grade_submission
from app.services.qiskit_simulator import SimulationExecutionError

router = APIRouter(prefix="/challenges", tags=["challenges"], route_class=SimulationRoute)
logger = logging.getLogger(__name__)


@router.get("", response_model=list[ChallengeDefinition])
def catalog():
    return [item.public for item in CATALOG.values()]


@router.post("/grade", response_model=GradeResponse)
def grade(request: GradeRequest):
    if request.challenge_id not in CATALOG:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    try:
        return grade_submission(request)
    except SimulationExecutionError:
        logger.exception("Challenge grading failed")
        return JSONResponse(status_code=503, content={"error": {
            "code": "grading_unavailable", "message": "Grading is temporarily unavailable. Your circuit is safe; please retry."}})
