"""Trusted, bounded variational experiments; no executable or free-form operators."""

from math import pi
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, StrictInt, model_validator

from app.schemas.algorithms import AlgorithmStage
from app.schemas.simulation import (
    QubitCount, RequestModel, ResponseModel, ShotCount, SimulationRequest,
    SimulationResponse, SimulatorBackend, SimulatorSeed,
)
from app.schemas.trace import TraceResponse

Parameter = Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-pi, le=pi)]
Parameters = Annotated[list[Parameter], Field(min_length=1, max_length=4)]


class PauliTerm(ResponseModel):
    pauli: str = Field(min_length=1, max_length=3, pattern=r"^[IXYZ]+$")
    coefficient: Annotated[float, Field(strict=True, ge=-4, le=4)]


class Hamiltonian(ResponseModel):
    num_qubits: QubitCount
    terms: list[PauliTerm] = Field(min_length=1, max_length=8)
    bit_order: Literal["q[n-1]...q[0]"] = "q[n-1]...q[0]"

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        if any(len(t.pauli) != self.num_qubits for t in self.terms):
            raise ValueError("Each Pauli string must match the Hamiltonian's qubit count")
        if len({t.pauli for t in self.terms}) != len(self.terms):
            raise ValueError("Combine duplicate Pauli strings before defining a Hamiltonian")
        return self


class OptimizationSettings(RequestModel):
    backend: SimulatorBackend = "qiskit"
    initial_parameters: Parameters | None = None
    initialization_seed: SimulatorSeed = 42
    max_iterations: Annotated[StrictInt, Field(ge=1, le=20)] = 12
    max_evaluations: Annotated[StrictInt, Field(ge=4, le=256)] = 128
    time_limit_seconds: Annotated[StrictInt, Field(ge=1, le=30)] = 20
    shots: ShotCount = 1024
    seed_simulator: SimulatorSeed | None = 42


class VQERequest(OptimizationSettings):
    algorithm: Literal["vqe"]
    problem_id: Literal["ising-pair"] = "ising-pair"

    @model_validator(mode="after")
    def parameter_dimensions(self) -> Self:
        if self.initial_parameters is not None and len(self.initial_parameters) != 4:
            raise ValueError("The two-spin ansatz requires exactly four angles")
        return self


GraphId = Literal["edge", "path", "triangle", "weighted-path"]


class QAOARequest(OptimizationSettings):
    algorithm: Literal["qaoa"]
    problem_id: GraphId = "edge"
    depth: Annotated[StrictInt, Field(ge=1, le=2)] = 1

    @model_validator(mode="after")
    def parameter_dimensions(self) -> Self:
        if self.initial_parameters is not None and len(self.initial_parameters) != 2 * self.depth:
            raise ValueError("QAOA requires gamma then beta for each layer (2 × depth angles)")
        return self


VariationalRequest = Annotated[VQERequest | QAOARequest, Field(discriminator="algorithm")]


class Edge(ResponseModel):
    source: Annotated[StrictInt, Field(ge=0, le=2)]
    target: Annotated[StrictInt, Field(ge=0, le=2)]
    weight: Annotated[float, Field(strict=True, gt=0, le=2)]


class Graph(ResponseModel):
    num_vertices: Annotated[StrictInt, Field(ge=2, le=3)]
    edges: list[Edge] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def simple_graph(self) -> Self:
        if any(not 0 <= e.source < e.target < self.num_vertices for e in self.edges):
            raise ValueError("Each edge must have distinct ordered vertices within the graph")
        if len({(e.source, e.target) for e in self.edges}) != len(self.edges):
            raise ValueError("Graph edges must be unique")
        return self


class ClassicalReference(ResponseModel):
    method: Literal["diagonalization", "enumeration"]
    value: float
    eigenvalues: list[float] = Field(default_factory=list, max_length=8)
    cut_values: dict[str, float] = Field(default_factory=dict)
    optimal_bitstrings: list[str] = Field(default_factory=list, max_length=8)


class Problem(ResponseModel):
    id: str
    title: str
    units: str
    hamiltonian: Hamiltonian
    graph: Graph | None = None


class VariationalDefinition(ResponseModel):
    version: Literal[1] = 1
    request: VariationalRequest
    problem: Problem
    parameter_order: list[str] = Field(min_length=1, max_length=4)
    bound_parameters: Parameters
    ansatz: str
    objective: Literal["energy", "negative-expected-cut"]
    circuit: SimulationRequest
    circuit_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    stages: list[AlgorithmStage]
    reference: ClassicalReference


class Evaluation(ResponseModel):
    evaluation: int = Field(ge=1, le=256)
    iteration: int = Field(ge=0, le=20)
    parameters: Parameters
    expectation: float
    objective: float
    best_objective: float
    elapsed_ms: float = Field(ge=0)


class OptimizationSummary(ResponseModel):
    method: Literal["scipy.optimize.minimize/Powell"] = "scipy.optimize.minimize/Powell"
    scipy_version: str
    objective_engine: str
    objective_sampling_performed: Literal[False] = False
    initial_parameters: Parameters
    best_parameters: Parameters
    initial_expectation: float
    best_expectation: float
    evaluations: int = Field(ge=1, le=256)
    iterations: int = Field(ge=0, le=20)
    stopping_reason: Literal["converged", "evaluation_limit", "iteration_limit", "optimizer_stopped"]
    converged: bool
    elapsed_ms: float = Field(ge=0)
    history: list[Evaluation] = Field(min_length=1, max_length=256)


class CutSummary(ResponseModel):
    expected_cut: float
    optimal_cut_probability: float = Field(ge=-1e-10, le=1 + 1e-10)
    best_sampled_bitstring: str = Field(pattern=r"^[01]{2,3}$")
    best_sampled_cut: float
    best_sampled_count: int = Field(ge=1, le=8192)


class VariationalResult(ResponseModel):
    definition: VariationalDefinition
    optimization: OptimizationSummary
    simulation: SimulationResponse
    trace: TraceResponse
    reference_gap: float
    explanation: str
    cut: CutSummary | None = None


class ResourceLimits(ResponseModel):
    max_qubits: Literal[3] = 3
    max_gates: Literal[256] = 256
    max_parameters: Literal[4] = 4
    max_depth: Literal[2] = 2
    max_iterations: Literal[20] = 20
    max_evaluations: Literal[256] = 256
    max_time_seconds: Literal[30] = 30
    active_jobs_per_process: Literal[1] = 1
    retained_jobs: Literal[8] = 8
    retention_seconds: Literal[600] = 600


class VariationalCatalog(ResponseModel):
    version: Literal[1] = 1
    problems: list[Problem]
    backends: list[SimulatorBackend] = ["qiskit", "pennylane"]
    limits: ResourceLimits = Field(default_factory=ResourceLimits)


class JobSnapshot(ResponseModel):
    job_id: UUID
    status: Literal["running", "completed", "cancelled", "timed_out", "failed"]
    request: VariationalRequest
    history: list[Evaluation] = Field(max_length=256)
    elapsed_ms: float = Field(ge=0)
    result: VariationalResult | None = None
    message: str | None = None
