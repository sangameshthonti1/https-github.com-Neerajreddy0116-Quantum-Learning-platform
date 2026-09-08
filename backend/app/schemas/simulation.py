"""Public circuit contract; no simulator-specific Python types."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from pydantic.alias_generators import to_camel

QubitIndex = Annotated[StrictInt, Field(ge=0)]
QubitCount = Annotated[StrictInt, Field(ge=1, le=3)]
ShotCount = Annotated[StrictInt, Field(ge=1, le=8192)]
SimulatorSeed = Annotated[StrictInt, Field(ge=0, le=4294967295)]
Angle = Annotated[float, Field(strict=True, allow_inf_nan=False)]
SimulatorBackend = Literal["qiskit", "pennylane"]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel)


class GateBase(RequestModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"\S")
    targets: list[QubitIndex] = Field(min_length=1, max_length=1)

    @model_validator(mode="after")
    def distinct_qubits(self) -> Self:
        qubits = self.targets + self.controls
        if len(set(qubits)) != len(qubits):
            raise ValueError(f"Gate {self.id!r}: controls and targets must be distinct and must not overlap")
        return self


class SingleQubitGate(GateBase):
    type: Literal["h", "x", "y", "z", "s", "sdg", "t", "tdg"]
    controls: list[QubitIndex] = Field(max_length=0)


class ControlledXGate(GateBase):
    type: Literal["cx"]
    controls: list[QubitIndex] = Field(min_length=1, max_length=1)


class RotationGate(GateBase):
    type: Literal["rx", "ry", "rz", "p"]
    controls: list[QubitIndex] = Field(max_length=0)
    # Actual JSON numbers only, in radians. Never reduce modulo 2*pi: doing
    # so would erase the native global phase of spinor rotations.
    params: list[Angle] = Field(min_length=1, max_length=1)


class ControlledZGate(GateBase):
    type: Literal["cz"]
    controls: list[QubitIndex] = Field(min_length=1, max_length=1)


class SwapGate(GateBase):
    type: Literal["swap"]
    targets: list[QubitIndex] = Field(min_length=2, max_length=2)
    controls: list[QubitIndex] = Field(max_length=0)


class ToffoliGate(GateBase):
    type: Literal["ccx"]
    controls: list[QubitIndex] = Field(min_length=2, max_length=2)


Gate = Annotated[
    SingleQubitGate | ControlledXGate | RotationGate | ControlledZGate | SwapGate | ToffoliGate,
    Field(discriminator="type"),
]


class SimulationRequest(RequestModel):
    num_qubits: QubitCount
    gates: list[Gate] = Field(max_length=256)
    shots: ShotCount
    backend: SimulatorBackend = "qiskit"
    seed_simulator: SimulatorSeed | None = None

    @model_validator(mode="after")
    def validate_circuit(self) -> Self:
        gate_ids = set()
        for gate in self.gates:
            if gate.id in gate_ids:
                raise ValueError(f"Duplicate gate id {gate.id!r}; gate IDs must be unique")
            gate_ids.add(gate.id)
            for index in gate.targets + gate.controls:
                if index >= self.num_qubits:
                    raise ValueError(
                        f"Gate {gate.id!r}: qubit index {index} is outside "
                        f"the valid range 0..{self.num_qubits - 1}"
                    )
        return self


class ResponseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        allow_inf_nan=False,
    )


class ComplexAmplitude(ResponseModel):
    real: float
    imag: float


class ExecutionMetadataBase(ResponseModel):
    method: Literal["statevector"] = "statevector"
    measurement: Literal["terminal-all"] = "terminal-all"
    statevector_stage: Literal["before-measurement"] = "before-measurement"
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"
    seed_simulator: SimulatorSeed
    gate_count: int = Field(ge=0)
    circuit_depth: int = Field(ge=0)
    execution_time_ms: float = Field(ge=0)


class ExecutionMetadata(ExecutionMetadataBase):
    qiskit_version: str
    aer_version: str


class PennyLaneExecutionMetadata(ExecutionMetadataBase):
    engine: Literal["pennylane.default.qubit"] = "pennylane.default.qubit"
    pennylane_version: str


class SimulationResponse(ResponseModel):
    backend: SimulatorBackend = "qiskit"
    num_qubits: QubitCount
    probabilities: dict[str, Annotated[float, Field(ge=0)]]
    counts: dict[str, Annotated[StrictInt, Field(ge=0)]]
    statevector: list[ComplexAmplitude]
    shots: ShotCount
    metadata: ExecutionMetadata | PennyLaneExecutionMetadata

    @model_validator(mode="after")
    def matching_engine(self) -> Self:
        if (self.backend == "qiskit") != isinstance(self.metadata, ExecutionMetadata):
            raise ValueError("Response backend and execution metadata must agree")
        return self


class ValidationIssue(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ValidationErrorResponse(BaseModel):
    detail: list[ValidationIssue]


class ExecutionErrorDetail(BaseModel):
    code: Literal["simulation_failed"] = "simulation_failed"
    message: str = "The simulator could not complete this circuit. Please retry."


class ExecutionErrorResponse(BaseModel):
    error: ExecutionErrorDetail = Field(default_factory=ExecutionErrorDetail)
