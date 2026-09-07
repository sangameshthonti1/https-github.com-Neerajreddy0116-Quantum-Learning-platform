"""Process liveness; this does not probe external services."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["quantum-learning-api"] = "quantum-learning-api"


@router.get("/health", response_model=HealthResponse, summary="Check API liveness")
async def get_health() -> HealthResponse:
    return HealthResponse()
