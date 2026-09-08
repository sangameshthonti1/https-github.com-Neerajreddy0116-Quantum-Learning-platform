"""Real bounded hybrid optimization over the existing two simulator adapters."""

from collections.abc import Callable
from hashlib import sha256
import json
from math import pi
from time import monotonic

import numpy as np
from pydantic import TypeAdapter
import scipy
from scipy.optimize import minimize

from app.schemas.algorithms import AlgorithmStage
from app.schemas.simulation import SimulationRequest
from app.schemas.variational import (
    CutSummary, Evaluation, Hamiltonian, OptimizationSummary, Parameters, Problem,
    VariationalDefinition, VariationalRequest, VariationalResult,
)
from app.services.pauli_math import TOLERANCE, expectation, ground_reference, hamiltonian_matrix
from app.services.simulation_errors import SimulationExecutionError
from app.services.simulators import get_simulator
from app.services.maxcut import GRAPHS, enumerate_cuts

ISING_PAIR = Problem(id="ising-pair", title="Two spins in a transverse field",
                     units="dimensionless educational energy",
                     hamiltonian=Hamiltonian(num_qubits=2, terms=[
                         {"pauli": "IX", "coefficient": -1.0},
                         {"pauli": "XI", "coefficient": -1.0},
                         {"pauli": "ZZ", "coefficient": 0.5},
                     ]))


class OptimizationInterrupted(RuntimeError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def parameter_order(request: VariationalRequest) -> list[str]:
    if request.algorithm == "qaoa":
        return [label for layer in range(request.depth)
                for label in (f"gamma{layer} · cost layer {layer + 1}", f"beta{layer} · mixer layer {layer + 1}")]
    return ["theta0 · initial RY q0", "theta1 · initial RY q1",
            "theta2 · final RY q0", "theta3 · final RY q1"]


def initial_parameters(request: VariationalRequest) -> list[float]:
    if request.initial_parameters is not None:
        return list(request.initial_parameters)
    return np.random.default_rng(request.initialization_seed).uniform(
        -pi / 2, pi / 2, len(parameter_order(request))).tolist()


def bind_circuit(request: VariationalRequest, parameters: list[float]):
    angles = TypeAdapter(Parameters).validate_python(parameters)
    if len(angles) != len(parameter_order(request)):
        raise ValueError("Parameter count does not match the trusted ansatz")
    gates, stages = [], []

    def gate(kind, target, angle=None, controls=()):
        gates.append(dict(id=f"v{len(gates)}", type=kind, targets=[target], controls=list(controls),
                          **({"params": [angle]} if angle is not None else {})))

    def stage(id, title, description):
        stages.append(AlgorithmStage(id=id, title=title, description=description,
                                     start_step=stages[-1].end_step if stages else 0, end_step=len(gates)))

    if request.algorithm == "vqe":
        n = 2
        gate("ry", 0, angles[0]); gate("ry", 1, angles[1])
        stage("prepare", "Choose two local directions", "theta0 and theta1 rotate q0 and q1 about Y.")
        gate("cx", 1, controls=(0,))
        stage("entangle", "Allow correlations", "CX q0→q1 gives the ansatz entangling capability.")
        gate("ry", 0, angles[2]); gate("ry", 1, angles[3])
        stage("adjust", "Adjust the correlated state", "theta2 and theta3 are final local Y rotations.")
    else:
        graph = GRAPHS[request.problem_id].graph
        n = graph.num_vertices
        for q in range(n):
            gate("h", q)
        stage("uniform", "Start with every partition", "Hadamards give equal amplitudes to all bitstrings.")
        for layer in range(request.depth):
            gamma, beta = angles[2 * layer:2 * layer + 2]
            for edge in graph.edges:
                # Parity compute → phase on parity 1 → uncompute implements
                # exp(-i gamma w (I-ZiZj)/2) EXACTLY, including its global phase.
                gate("cx", edge.target, controls=(edge.source,))
                gate("p", edge.target, -gamma * edge.weight)
                gate("cx", edge.target, controls=(edge.source,))
            stage(f"cost-{layer}", f"Cost layer {layer + 1}", "Crossing edges receive phase −gamma × weight. Probabilities alone do not change here.")
            for q in range(n):
                gate("rx", q, 2 * beta)
            stage(f"mixer-{layer}", f"Mixer layer {layer + 1}", "RX(2 beta) on every vertex implements exp(−i beta ΣX), turning phases into interference.")
    circuit = SimulationRequest.model_validate(dict(numQubits=n, gates=gates, shots=request.shots,
                                                     backend=request.backend, seedSimulator=request.seed_simulator))
    return circuit, stages


def build_variational(request: VariationalRequest, parameters: list[float] | None = None) -> VariationalDefinition:
    angles = initial_parameters(request) if parameters is None else parameters
    circuit, stages = bind_circuit(request, angles)
    identity = {"request": request.model_dump(by_alias=True), "circuit": circuit.model_dump(by_alias=True)}
    digest = sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    problem = ISING_PAIR if request.algorithm == "vqe" else GRAPHS[request.problem_id]
    return VariationalDefinition(
        request=request, problem=problem.model_copy(deep=True),
        parameter_order=parameter_order(request), bound_parameters=angles,
        ansatz=("RY on each qubit → CX q0→q1 → RY on each qubit; four independent angles" if request.algorithm == "vqe"
                else f"H on every vertex → {request.depth} cost/mixer layers; gamma then beta per layer"),
        objective="energy" if request.algorithm == "vqe" else "negative-expected-cut",
        circuit=circuit, circuit_digest=digest, stages=stages,
        reference=ground_reference(problem.hamiltonian) if problem.graph is None else enumerate_cuts(problem.graph),
    )


def optimize(request: VariationalRequest, *, on_evaluation: Callable[[Evaluation], None] | None = None,
             cancelled: Callable[[], bool] = lambda: False, clock: Callable[[], float] = monotonic) -> VariationalResult:
    started = clock()

    def checkpoint():
        if cancelled():
            raise OptimizationInterrupted("cancelled")
        if clock() - started >= request.time_limit_seconds:
            raise OptimizationInterrupted("timed_out")

    checkpoint()
    definition = build_variational(request)
    h = hamiltonian_matrix(definition.problem.hamiltonian)
    adapter = get_simulator(request.backend)
    history: list[Evaluation] = []
    iterations = 0
    objective_engine = ""
    sign = 1 if definition.objective == "energy" else -1

    def objective(parameters):
        nonlocal objective_engine
        checkpoint()
        if len(history) >= request.max_evaluations:
            raise SimulationExecutionError("Optimizer exceeded its evaluation budget")
        values = np.asarray(parameters).tolist()
        circuit, _ = bind_circuit(request, values)
        # Exact adapter trace: no sampling and no inferred phases. Only the final
        # state is needed for E; intermediate states stay available for final inspection.
        traced = adapter.trace(circuit)
        checkpoint()
        objective_engine = traced.metadata.engine
        state = [complex(a.real, a.imag) for a in traced.steps[-1].statevector]
        energy = expectation(state, h)
        if sign * (energy - definition.reference.value) < -TOLERANCE:
            raise SimulationExecutionError("Exact expectation violated the classical spectral bound")
        value = sign * energy
        point = Evaluation(evaluation=len(history) + 1, iteration=iterations, parameters=values,
                           expectation=energy, objective=value,
                           best_objective=min(value, history[-1].best_objective) if history else value,
                           elapsed_ms=(clock() - started) * 1000)
        history.append(point)
        if on_evaluation is not None:
            on_evaluation(point.model_copy(deep=True))
        return value

    def iteration_completed(_parameters):
        nonlocal iterations
        iterations += 1
        checkpoint()

    optimized = minimize(objective, definition.bound_parameters, method="Powell",
                         bounds=[(-pi, pi)] * len(definition.bound_parameters), callback=iteration_completed,
                         options={"maxiter": request.max_iterations, "maxfev": request.max_evaluations,
                                  "xtol": 1e-5, "ftol": 1e-7})
    checkpoint()
    if not history:
        raise SimulationExecutionError("Optimizer returned without evaluating the circuit")
    best = min(history, key=lambda point: point.objective)
    final = build_variational(request, best.parameters)
    simulation = adapter.simulate(final.circuit)
    checkpoint()
    trace = adapter.trace(final.circuit)
    checkpoint()
    a = np.array([complex(x.real, x.imag) for x in simulation.statevector])
    b = np.array([complex(x.real, x.imag) for x in trace.steps[-1].statevector])
    if (not np.allclose(np.outer(a, a.conj()), np.outer(b, b.conj()), atol=TOLERANCE, rtol=0)
            or abs(expectation(a, h) - best.expectation) > TOLERANCE):
        raise SimulationExecutionError("Final state disagrees with the best observed expectation")
    reason = {0: "converged", 1: "evaluation_limit", 2: "iteration_limit"}.get(int(optimized.status), "optimizer_stopped")
    gap = sign * (best.expectation - final.reference.value)
    cut = None
    if request.algorithm == "qaoa":
        ref = final.reference
        candidate = min((label for label, count in simulation.counts.items() if count > 0),
                        key=lambda label: (-ref.cut_values[label], -simulation.counts[label], label))
        cut = CutSummary(expected_cut=best.expectation,
                         optimal_cut_probability=sum(simulation.probabilities[b] for b in ref.optimal_bitstrings),
                         best_sampled_bitstring=candidate, best_sampled_cut=ref.cut_values[candidate],
                         best_sampled_count=simulation.counts[candidate])
    return VariationalResult(
        definition=final, simulation=simulation, trace=trace, reference_gap=gap, cut=cut,
        optimization=OptimizationSummary(
            scipy_version=scipy.__version__, objective_engine=objective_engine,
            initial_parameters=definition.bound_parameters, best_parameters=best.parameters,
            initial_expectation=history[0].expectation, best_expectation=best.expectation,
            evaluations=len(history), iterations=int(optimized.nit), stopping_reason=reason,
            converged=bool(optimized.success), elapsed_ms=(clock() - started) * 1000, history=history),
        explanation=((f"The best observed trial energy was {best.expectation:.8f}; exact diagonalization gives "
                     f"{final.reference.value:.8f}. The energy gap is {gap:.8f} in dimensionless units. "
                     "This is a variational trial state, not a guaranteed global optimum or a chemistry calculation. "
                     "Energy uses complex amplitudes and X terms; terminal measurement counts are separate.") if cut is None else
                     (f"Minimizing the negative expected cut produced expected cut {best.expectation:.8f}. "
                      f"Classical enumeration gives maximum cut {final.reference.value:g}. The exact ideal probability "
                      f"of an optimal cut is {cut.optimal_cut_probability:.6%}; the best sampled candidate was "
                      f"{cut.best_sampled_bitstring}, cut {cut.best_sampled_cut:g}. "
                      "A sample is one partition, not the expectation. This bounded local search does not guarantee "
                      "the optimum or demonstrate a quantum speedup.")),
    )
