"""Composition point for API routes."""

from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.simulation import router as simulation_router
from app.api.routes.tutor import router as tutor_router
from app.api.routes.challenges import router as challenges_router
from app.api.routes.circuit_code import router as circuit_code_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(simulation_router)
api_router.include_router(tutor_router)
api_router.include_router(challenges_router)
api_router.include_router(circuit_code_router)
