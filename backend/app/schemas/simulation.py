"""Public circuit contract; no simulator-specific Python types."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from pydantic.alias_generators import to_camel

QubitIndex = Annotated[StrictInt, Field(ge=0)]
QubitCount = Annotated[StrictInt, Field(ge=1, le=3)]
ShotCount = Annotated[StrictInt, Field(ge=1, le=8192)]
SimulatorSeed = Annotated[StrictInt, Field(ge=0, le=4294967295)]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel)


class GateBase(RequestModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"\S")
    targets: list[QubitIndex] = Field(min_length=1, max_length=1)


class SingleQubitGate(GateBase):
    type: Literal["h", "x", "z"]
    controls: list[QubitIndex] = Field(max_length=0)


class ControlledXGate(GateBase):
    type: Literal["cx"]
    controls: list[QubitIndex] = Field(min_length=1, max_length=1)

    @model_validator(mode="after")
    def disjoint_qubits(self) -> Self:
        if set(self.targets) & set(self.controls):
            raise ValueError(f"Gate {self.id!r}: controls and targets must not overlap")
        return self


Gate = Annotated[SingleQubitGate | ControlledXGate, Field(discriminator="type")]


class SimulationRequest(RequestModel):
    num_qubits: QubitCount
    gates: list[Gate] = Field(max_length=256)
    shots: ShotCount
    backend: Literal["qiskit"]
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


class ExecutionMetadata(ResponseModel):
    method: Literal["statevector"] = "statevector"
    measurement: Literal["terminal-all"] = "terminal-all"
    statevector_stage: Literal["before-measurement"] = "before-measurement"
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"
    seed_simulator: SimulatorSeed
    gate_count: int = Field(ge=0)
    circuit_depth: int = Field(ge=0)
    execution_time_ms: float = Field(ge=0)
    qiskit_version: str
    aer_version: str


class SimulationResponse(ResponseModel):
    backend: Literal["qiskit"] = "qiskit"
    num_qubits: QubitCount
    probabilities: dict[str, Annotated[float, Field(ge=0)]]
    counts: dict[str, Annotated[StrictInt, Field(ge=0)]]
    statevector: list[ComplexAmplitude]
    shots: ShotCount
    metadata: ExecutionMetadata


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
