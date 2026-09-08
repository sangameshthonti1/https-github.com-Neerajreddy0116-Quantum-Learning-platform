"""Bounded tutor input, provider output, and independently computed facts."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from app.schemas.simulation import RequestModel, ResponseModel, SimulationRequest
from app.schemas.trace import TraceStep

LessonId = Literal["measurement", "superposition", "phase", "entanglement"]
Text = Annotated[str, Field(min_length=1, max_length=2000, pattern=r"\S")]


class TutorMessage(RequestModel):
    role: Literal["user", "assistant"]
    content: Text


class TutorRequest(RequestModel):
    question: Text
    mode: Literal["learn", "circuit"] = "learn"
    lesson_id: LessonId | None = None
    circuit: SimulationRequest | None = None
    selected_step: Annotated[StrictInt, Field(ge=0, le=256)] | None = None
    history: list[TutorMessage] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def context_bounds(self) -> Self:
        if sum(len(m.content) for m in self.history) > 8000:
            raise ValueError("Recent conversation must total at most 8000 characters")
        if self.selected_step is not None and (self.circuit is None or self.selected_step > len(self.circuit.gates)):
            raise ValueError("Select a step belonging to the current circuit, or omit selectedStep")
        if self.mode == "circuit" and self.circuit is None:
            raise ValueError("Circuit analysis needs a circuit; an empty circuit is welcome")
        return self


class StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProposedGate(StrictOutput):
    # Simple provider schema; all cross-field rules are checked against the
    # canonical SimulationRequest AFTER generation, never delegated to the LLM.
    type: Literal["h", "x", "z", "cx"]
    target: Annotated[int, Field(ge=0, le=2)]
    control: Annotated[int, Field(ge=0, le=2)] | None


class ProposedCircuit(StrictOutput):
    title: Annotated[str, Field(min_length=1, max_length=100)]
    rationale: Annotated[str, Field(min_length=1, max_length=600)]
    num_qubits: Annotated[int, Field(ge=1, le=3)]
    gates: Annotated[list[ProposedGate], Field(max_length=32)]


class TutorAnswer(StrictOutput):
    answer: Annotated[str, Field(min_length=1, max_length=6000, pattern=r"\S")]
    deeper: Annotated[str, Field(min_length=1, max_length=4000)] | None
    follow_up: Annotated[str, Field(min_length=1, max_length=300)] | None
    suggestion: ProposedCircuit | None


class CircuitFacts(ResponseModel):
    source: Literal["qiskit-trace"] = "qiskit-trace"
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"
    sampling_performed: Literal[False] = False
    circuit: SimulationRequest
    selected_step: int
    # All steps for <=16 gates; otherwise initial, first, selected, preceding, final.
    snapshots: list[TraceStep]
    total_steps: int


class ValidatedSuggestion(ResponseModel):
    title: str
    rationale: str
    circuit: SimulationRequest
    facts: CircuitFacts


class TutorResponse(ResponseModel):
    answer: str
    deeper: str | None
    follow_up: str | None
    lesson_id: LessonId | None
    facts: CircuitFacts | None
    suggestion: ValidatedSuggestion | None
    explanation_source: Literal["ai"] = "ai"


class TutorErrorDetail(ResponseModel):
    code: str
    message: str


class TutorErrorResponse(ResponseModel):
    error: TutorErrorDetail
