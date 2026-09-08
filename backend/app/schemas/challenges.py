"""Challenge HTTP contracts. Targets and scores are never request fields."""

from typing import Literal

from pydantic import Field

from app.schemas.simulation import ComplexAmplitude, RequestModel, ResponseModel, SimulationRequest


class ChallengeDefinition(ResponseModel):
    id: str
    version: Literal[1] = 1
    title: str
    difficulty: Literal["First steps", "Building intuition", "Making connections"]
    objective: str
    statement: str
    initial_state: str
    starting_circuit: SimulationRequest
    allowed_gates: list[Literal["h", "x", "z", "cx"]]
    max_gates: int = 256
    preparation_steps: int = 0
    constraints: list[str]
    criterion: Literal["state", "distribution"] = "state"
    target_label: str
    target_state: list[ComplexAmplitude] | None
    target_probabilities: dict[str, float]
    hints: list[str]
    tolerance: float = 1e-10
    scoring: str = (
        "100 points and completion require the target within tolerance and every constraint. "
        "Otherwise, a valid circuit earns floor(100 × similarity), capped at 99. "
        "Similarity is state fidelity, or 1 minus total variation distance for a distribution. "
        "Constraint violations earn 0. Hints and attempts do not reduce your score."
    )


class GradeRequest(RequestModel):
    challenge_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    submission_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")
    circuit: SimulationRequest


class ComparisonMetrics(ResponseModel):
    fidelity: float | None = Field(default=None, ge=0, le=1)
    total_variation_distance: float = Field(ge=0, le=1)
    similarity: float = Field(ge=0, le=1)
    state_norm: float
    tolerance: float


class GradeResponse(ResponseModel):
    challenge_id: str
    challenge_version: Literal[1] = 1
    submission_id: str
    circuit: SimulationRequest
    circuit_digest: str
    valid: bool
    target_achieved: bool
    score: int = Field(ge=0, le=100)
    criterion: Literal["state", "distribution"]
    metrics: ComparisonMetrics | None = None
    violated_constraints: list[str]
    feedback: str
    next_hint: str | None = None
    inspect_step: int | None = None
    statevector: list[ComplexAmplitude] | None = None
    probabilities: dict[str, float] | None = None
    engine: Literal["qiskit-aer-statevector"] = "qiskit-aer-statevector"
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"
    sampling_used_for_grading: Literal[False] = False
