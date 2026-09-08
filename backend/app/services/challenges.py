"""Deterministic grading of complete ideal states; never grade sampled counts."""

import hashlib
import json
from math import floor

import numpy as np

from app.schemas.challenges import ComparisonMetrics, GradeRequest, GradeResponse
from app.services.challenge_catalog import CATALOG
from app.services.qiskit_simulator import SimulationExecutionError, simulate_circuit

NORMALIZATION_TOLERANCE = 1e-10


def normalized_vector(values, size):
    vector = np.asarray(values, dtype=complex)
    norm = float(np.vdot(vector, vector).real)
    if vector.shape != (size,) or not np.isfinite(vector).all() or not np.isfinite(norm) or abs(norm - 1) > NORMALIZATION_TOLERANCE:
        raise SimulationExecutionError("Grading requires a finite normalized statevector")
    # Correct only floating-point norm drift after validating physical validity.
    return vector / np.sqrt(norm), norm


def compare(actual, target, probabilities, tolerance):
    state, norm = normalized_vector(actual, len(probabilities))
    expected = np.asarray(probabilities, dtype=float)
    if not np.isfinite(expected).all() or np.any(expected < 0) or abs(float(expected.sum()) - 1) > NORMALIZATION_TOLERANCE:
        raise SimulationExecutionError("Invalid trusted target distribution")
    expected = expected / expected.sum()
    distance = float(np.clip(np.abs(np.abs(state)**2 - expected).sum() / 2, 0, 1))
    fidelity = None
    if target is not None:
        target_state, _ = normalized_vector(target, len(probabilities))
        # |<target|actual>|² is invariant under any common complex phase.
        fidelity = float(np.clip(abs(np.vdot(target_state, state))**2, 0, 1))
    similarity = fidelity if fidelity is not None else 1 - distance
    return ComparisonMetrics(fidelity=fidelity, total_variation_distance=distance,
                             similarity=similarity, state_norm=norm, tolerance=tolerance)


def same_operation(a, b):
    return a.type == b.type and a.targets == b.targets and a.controls == b.controls


def grade_submission(request: GradeRequest) -> GradeResponse:
    challenge = CATALOG[request.challenge_id].public
    circuit = request.circuit
    violations = []
    if circuit.num_qubits != challenge.starting_circuit.num_qubits:
        violations.append(challenge.constraints[0])
    if any(g.type not in challenge.allowed_gates for g in circuit.gates):
        violations.append("Use only the allowed gates: " + ", ".join(challenge.allowed_gates).upper() + ".")
    if len(circuit.gates) > challenge.max_gates:
        violations.append(f"Use at most {challenge.max_gates} gates.")
    prefix = challenge.starting_circuit.gates
    if len(circuit.gates) < len(prefix) or any(not same_operation(a, b) for a, b in zip(prefix, circuit.gates)):
        violations.append("Restore the provided preparation steps in their original order and on their original wires. Reset restores them.")
    digest = hashlib.sha256(json.dumps(circuit.model_dump(by_alias=True), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    base = dict(challenge_id=request.challenge_id, submission_id=request.submission_id,
                circuit=circuit, circuit_digest=digest, criterion=challenge.criterion,
                valid=not violations, violated_constraints=violations)
    if circuit.num_qubits != challenge.starting_circuit.num_qubits:
        return GradeResponse(**base, target_achieved=False, score=0,
                             feedback="This circuit uses a different number of qubits. Restore the challenge setup and submit again.")

    # Reuse the existing Aer engine. One unused shot bounds work regardless of the
    # Lab's sampling settings. Only its pre-measurement statevector is evidence.
    result = simulate_circuit(circuit.model_copy(update={"shots": 1, "seed_simulator": 0}))
    actual = [complex(a.real, a.imag) for a in result.statevector]
    target = None if challenge.target_state is None else [complex(a.real, a.imag) for a in challenge.target_state]
    metrics = compare(actual, target, list(challenge.target_probabilities.values()), challenge.tolerance)
    achieved = 1 - metrics.similarity <= challenge.tolerance
    score = 0 if violations else 100 if achieved else min(99, floor(100 * metrics.similarity + 1e-9))
    if violations:
        feedback = "The preparation is part of this experiment. " + ("Your final target matches, but the stated circuit constraints still need to be satisfied." if achieved else "Restore the required steps, then revise your circuit.")
    elif achieved:
        feedback = ("Your exact ideal measurement distribution matches the goal. Relative phase is intentionally unrestricted in this challenge."
                    if challenge.criterion == "distribution" else "Your complete quantum state matches the target, including its relative phases. A common global phase does not change the state.")
    elif challenge.criterion == "state" and metrics.total_variation_distance <= challenge.tolerance:
        feedback = ("Your measurement probabilities match, but the relative phase does not. Matching measurement chances does not mean matching the full quantum state. "
                    "Inspect the amplitude signs in State Explorer; a phase change on just one branch can change the state.")
    else:
        label = max(challenge.target_probabilities, key=lambda b: abs(result.probabilities[b] - challenge.target_probabilities[b]))
        feedback = (f"For |{label}⟩ your ideal probability is {result.probabilities[label] * 100:.2f}%; the target is {challenge.target_probabilities[label] * 100:.2f}%. "
                    "Follow the circuit in State Explorer to see where amplitude moves between outcomes.")
    return GradeResponse(**base, target_achieved=achieved, score=score, metrics=metrics,
                         feedback=feedback, next_hint=None if achieved and not violations else challenge.hints[0],
                         inspect_step=None if achieved and not violations else len(circuit.gates),
                         statevector=result.statevector, probabilities=result.probabilities)
