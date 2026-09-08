"""Code conversion is data validation, never an execution endpoint."""

from pydantic import Field

from app.schemas.simulation import RequestModel, ResponseModel, ShotCount, SimulatorSeed, SimulationRequest


class ParseCodeRequest(RequestModel):
    source: str = Field(strict=True)
    shots: ShotCount = 1024
    seed_simulator: SimulatorSeed | None = None


class CodeDiagnostic(ResponseModel):
    line: int = Field(ge=1)
    column: int = Field(ge=1)
    message: str
    code: str


class CodeErrorResponse(ResponseModel):
    diagnostics: list[CodeDiagnostic]


class ParseCodeResponse(ResponseModel):
    circuit: SimulationRequest
