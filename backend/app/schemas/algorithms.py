"""Bounded selections and authoritative algorithm snapshots; core contracts stay intact."""

from typing import Annotated, Literal, Self

from pydantic import Field, StrictInt, model_validator

from app.schemas.simulation import RequestModel, ResponseModel, ShotCount, SimulatorBackend, SimulatorSeed, SimulationRequest, SimulationResponse
from app.schemas.trace import TraceResponse

SmallRegister = Annotated[StrictInt, Field(ge=1, le=2)]
AlgorithmId = Literal["deutsch-jozsa", "grover"]
OracleId = Literal["zero", "one", "q0", "not-q0", "q1", "not-q1", "xor", "xnor"]


class DeutschJozsaRequest(RequestModel):
    algorithm: Literal["deutsch-jozsa"]
    input_qubits: SmallRegister
    oracle_id: OracleId
    shots: ShotCount = 1024
    seed_simulator: SimulatorSeed | None = None
    backend: SimulatorBackend = "qiskit"

    @model_validator(mode="after")
    def supported_oracle(self) -> Self:
        if self.input_qubits == 1 and self.oracle_id not in ("zero", "one", "q0", "not-q0"):
            raise ValueError("This oracle needs two input qubits.")
        return self


class GroverRequest(RequestModel):
    algorithm: Literal["grover"]
    num_qubits: SmallRegister
    marked_item: str = Field(min_length=1, max_length=2, pattern=r"^[01]+$")
    iterations: Annotated[StrictInt, Field(ge=0, le=4)]
    shots: ShotCount = 1024
    seed_simulator: SimulatorSeed | None = None
    backend: SimulatorBackend = "qiskit"

    @model_validator(mode="after")
    def matching_item(self) -> Self:
        if len(self.marked_item) != self.num_qubits:
            raise ValueError("The marked item must have exactly numQubits bits, in q[n-1]...q[0] order.")
        return self


AlgorithmRequest = Annotated[DeutschJozsaRequest | GroverRequest, Field(discriminator="algorithm")]


class TruthRow(ResponseModel):
    input: str
    output: Literal[0, 1]


class OracleDefinition(ResponseModel):
    id: OracleId
    label: str
    input_qubits: SmallRegister
    category: Literal["constant", "balanced"]
    truth_table: list[TruthRow]


class CatalogEntry(ResponseModel):
    id: AlgorithmId
    title: str
    summary: str
    register_sizes: list[SmallRegister]
    max_iterations: int | None = None
    oracles: list[OracleDefinition] = Field(default_factory=list)


class AlgorithmStage(ResponseModel):
    id: str
    title: str
    description: str
    # Gates with start_step < trace index <= end_step belong to this stage.
    # Empty identity oracles intentionally have equal boundaries.
    start_step: int = Field(ge=0, le=256)
    end_step: int = Field(ge=0, le=256)
    iteration: int | None = None


class AlgorithmDefinition(ResponseModel):
    version: Literal[1] = 1
    parameters: AlgorithmRequest
    circuit: SimulationRequest
    circuit_digest: str
    stages: list[AlgorithmStage]
    input_register: list[int]
    ancilla_qubit: int | None = None
    oracle: OracleDefinition | None = None
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"


class DeutschJozsaInterpretation(ResponseModel):
    algorithm: Literal["deutsch-jozsa"] = "deutsch-jozsa"
    classification: Literal["constant", "balanced", "inconclusive"]
    input_probabilities: dict[str, float]
    input_counts: dict[str, int]
    zero_input_probability: float
    oracle_queries: Literal[1] = 1
    classical_worst_case_queries: int
    explanation: str
    tolerance: float = 1e-10


class IterationObservation(ResponseModel):
    iteration: int
    step: int
    success_probability: float


class GroverInterpretation(ResponseModel):
    algorithm: Literal["grover"] = "grover"
    marked_item: str
    success_probability: float
    sampled_success_count: int
    sampled_success_rate: float
    iterations: list[IterationObservation]
    explanation: str
    tolerance: float = 1e-10


class AlgorithmRun(ResponseModel):
    definition: AlgorithmDefinition
    simulation: SimulationResponse
    trace: TraceResponse
    interpretation: Annotated[DeutschJozsaInterpretation | GroverInterpretation, Field(discriminator="algorithm")]
