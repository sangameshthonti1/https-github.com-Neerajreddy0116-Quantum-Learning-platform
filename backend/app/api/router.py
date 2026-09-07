"""Composition point for API routes."""

from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.simulation import router as simulation_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(simulation_router)
