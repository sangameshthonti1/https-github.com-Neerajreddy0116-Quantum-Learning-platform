"""Deterministic pre-measurement trace; reuses the canonical gate contract."""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas.simulation import (
    ComplexAmplitude,
    Gate,
    QubitCount,
    QubitIndex,
    ResponseModel,
    SimulatorBackend,
)

DensityRow = tuple[ComplexAmplitude, ComplexAmplitude]


class BlochVector(ResponseModel):
    x: float
    y: float
    z: float


class ReducedQubitState(ResponseModel):
    qubit: QubitIndex
    density_matrix: tuple[DensityRow, DensityRow]
    bloch_vector: BlochVector


class TraceStep(ResponseModel):
    index: int = Field(ge=0, le=256)
    # Step 0 is the initial state; every later step echoes its canonical gate.
    gate: Gate | None
    statevector: list[ComplexAmplitude] = Field(min_length=2, max_length=8)
    probabilities: dict[str, Annotated[float, Field(ge=0)]]
    qubits: list[ReducedQubitState] = Field(min_length=1, max_length=3)


class TraceMetadataBase(ResponseModel):
    method: Literal["statevector"] = "statevector"
    measurement: Literal["terminal-all"] = "terminal-all"
    statevector_stage: Literal["before-measurement"] = "before-measurement"
    sampling_performed: Literal[False] = False
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"
    reduced_basis_order: tuple[Literal["0"], Literal["1"]] = ("0", "1")
    gate_count: int = Field(ge=0, le=256)
    step_count: int = Field(ge=1, le=257)
    execution_time_ms: float = Field(ge=0)


class TraceMetadata(TraceMetadataBase):
    engine: Literal["qiskit.quantum_info.Statevector"] = "qiskit.quantum_info.Statevector"
    global_phase: Literal["qiskit-native"] = "qiskit-native"
    qiskit_version: str


class PennyLaneTraceMetadata(TraceMetadataBase):
    engine: Literal["pennylane.default.qubit"] = "pennylane.default.qubit"
    global_phase: Literal["pennylane-native"] = "pennylane-native"
    pennylane_version: str


class TraceResponse(ResponseModel):
    backend: SimulatorBackend = "qiskit"
    num_qubits: QubitCount
    basis_order: list[str] = Field(min_length=2, max_length=8)
    steps: list[TraceStep] = Field(min_length=1, max_length=257)
    metadata: TraceMetadata | PennyLaneTraceMetadata

    @model_validator(mode="after")
    def matching_engine(self) -> Self:
        if (self.backend == "qiskit") != isinstance(self.metadata, TraceMetadata):
            raise ValueError("Response backend and trace metadata must agree")
        return self
