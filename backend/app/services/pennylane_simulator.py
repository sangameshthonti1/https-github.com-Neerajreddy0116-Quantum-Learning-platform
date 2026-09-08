"""Independent PennyLane default.qubit execution of canonical unitary circuits.

Device wires are explicitly [n-1, ..., 0]: PennyLane's leftmost tensor axis is
the first device wire, whereas the application assigns q0 to the rightmost bit.
Operations keep their logical qubit labels, controls first, then targets.
No Qiskit objects, converters, optimizers or sampled-state reconstruction.
"""

from numbers import Integral
from secrets import randbits
from time import perf_counter

import numpy as np
import pennylane as qml

from app.schemas.simulation import (
    ComplexAmplitude, Gate, PennyLaneExecutionMetadata, RotationGate,
    SimulationRequest, SimulationResponse,
)
from app.schemas.trace import (
    BlochVector, PennyLaneTraceMetadata, ReducedQubitState, TraceResponse, TraceStep,
)
from app.services.simulation_errors import SimulationExecutionError

TOLERANCE = 1e-12
OPERATIONS = {
    "h": qml.Hadamard, "x": qml.PauliX, "y": qml.PauliY, "z": qml.PauliZ,
    "s": qml.S, "sdg": qml.adjoint(qml.S),
    "t": qml.T, "tdg": qml.adjoint(qml.T),
    "rx": qml.RX, "ry": qml.RY, "rz": qml.RZ, "p": qml.PhaseShift,
    "cx": qml.CNOT, "cz": qml.CZ, "swap": qml.SWAP, "ccx": qml.Toffoli,
}


def build_circuit(request: SimulationRequest, *, seed: int = 0,
                  snapshots: bool = False, sample: bool = False):
    """Build a fresh device/QNode per execution, isolating RNG and snapshots."""
    wires = list(reversed(range(request.num_qubits)))
    device = qml.device("default.qubit", wires=wires, seed=seed, max_workers=None)

    @qml.qnode(device, interface=None, diff_method=None)
    def circuit():
        if snapshots:
            qml.Snapshot("step-0")
        for index, gate in enumerate(request.gates, start=1):
            parameters = gate.params if isinstance(gate, RotationGate) else []
            OPERATIONS[gate.type](*parameters, wires=gate.controls + gate.targets)
            if snapshots:
                qml.Snapshot(f"step-{index}")
        return qml.counts(wires=wires, all_outcomes=True) if sample else qml.state()

    return qml.set_shots(circuit, shots=request.shots) if sample else circuit


def _state(values, num_qubits: int) -> np.ndarray:
    state = np.asarray(values, dtype=np.complex128)
    if (state.shape != (2**num_qubits,) or not np.isfinite(state).all()
            or abs(np.vdot(state, state).real - 1) > TOLERANCE):
        raise SimulationExecutionError("PennyLane returned a nonfinite or unnormalized state")
    return state


def _amplitude(value: complex) -> ComplexAmplitude:
    return ComplexAmplitude(real=float(value.real), imag=float(value.imag))


def _probabilities(state: np.ndarray, num_qubits: int) -> dict[str, float]:
    return {format(i, f"0{num_qubits}b"): float(a.real**2 + a.imag**2)
            for i, a in enumerate(state)}


def _depth(request: SimulationRequest) -> int:
    """Logical input depth, with disjoint operations allowed in the same layer."""
    layers = [0] * request.num_qubits
    for gate in request.gates:
        wires = gate.controls + gate.targets
        layer = 1 + max(layers[q] for q in wires)
        for q in wires:
            layers[q] = layer
    return max(layers)


def simulate_circuit(request: SimulationRequest) -> SimulationResponse:
    started = perf_counter()
    seed = request.seed_simulator if request.seed_simulator is not None else randbits(32)
    try:
        # Analytic state and finite-shot measurement are separate real executions.
        # The seed initializes a fresh sampling device; analytic work consumes no RNG.
        state = _state(build_circuit(request)(), request.num_qubits)
        probabilities = _probabilities(state, request.num_qubits)
        raw_counts = build_circuit(request, seed=seed, sample=True)()
        if (not isinstance(raw_counts, dict) or set(raw_counts) != set(probabilities)
                or any(isinstance(c, bool) or not isinstance(c, Integral) or c < 0
                       for c in raw_counts.values())):
            raise SimulationExecutionError("PennyLane returned an unexpected count layout")
        counts = {label: int(raw_counts[label]) for label in probabilities}
        if sum(counts.values()) != request.shots:
            raise SimulationExecutionError("PennyLane returned an unexpected shot total")
        return SimulationResponse(
            backend="pennylane", num_qubits=request.num_qubits, shots=request.shots,
            probabilities=probabilities, counts=counts,
            statevector=[_amplitude(a) for a in state],
            metadata=PennyLaneExecutionMetadata(
                seed_simulator=seed, gate_count=len(request.gates), circuit_depth=_depth(request),
                execution_time_ms=(perf_counter() - started) * 1000,
                pennylane_version=qml.__version__,
            ),
        )
    except SimulationExecutionError:
        raise
    except Exception as exc:
        raise SimulationExecutionError("Local PennyLane execution failed") from exc


def _snapshot(values, num_qubits: int, index: int, gate: Gate | None) -> TraceStep:
    state = _state(values, num_qubits)
    qubits = []
    for qubit in range(num_qubits):
        # reduce_statevector indices are tensor positions, not logical wire labels.
        rho = np.asarray(qml.math.reduce_statevector(state, indices=[num_qubits - 1 - qubit]))
        if (rho.shape != (2, 2) or not np.isfinite(rho).all()
                or not np.allclose(rho, rho.conj().T, atol=TOLERANCE, rtol=0)
                or abs(np.trace(rho) - 1) > TOLERANCE
                or np.linalg.eigvalsh(rho).min() < -TOLERANCE):
            raise SimulationExecutionError("PennyLane returned an invalid reduced density matrix")
        qubits.append(ReducedQubitState(
            qubit=qubit,
            density_matrix=tuple(tuple(_amplitude(a) for a in row) for row in rho),
            bloch_vector=BlochVector(x=float(2 * rho[0, 1].real),
                                     y=float(-2 * rho[0, 1].imag),
                                     z=float(rho[0, 0].real - rho[1, 1].real)),
        ))
    # Existing clients compute purity Tr(rho^2) from this Hermitian density matrix.
    # Preserve native phase, residuals and mixedness; do not normalize or round.
    return TraceStep(index=index, gate=gate, statevector=[_amplitude(a) for a in state],
                     probabilities=_probabilities(state, num_qubits), qubits=qubits)


def trace_circuit(request: SimulationRequest) -> TraceResponse:
    started = perf_counter()
    try:
        # default.qubit supports snapshots during a single execution. No compilation
        # transforms can fuse/reorder gates across the requested snapshot boundaries.
        captured = qml.snapshots(build_circuit(request, snapshots=True))()
        steps = [_snapshot(captured[f"step-{i}"], request.num_qubits, i, gate)
                 for i, gate in enumerate([None, *request.gates])]
        final = _state(captured["execution_results"], request.num_qubits)
        if not np.allclose(final, captured[f"step-{len(request.gates)}"], atol=TOLERANCE, rtol=0):
            raise SimulationExecutionError("PennyLane final snapshot and state disagree")
        return TraceResponse(
            backend="pennylane", num_qubits=request.num_qubits,
            basis_order=list(steps[0].probabilities), steps=steps,
            metadata=PennyLaneTraceMetadata(
                gate_count=len(request.gates), step_count=len(steps),
                execution_time_ms=(perf_counter() - started) * 1000,
                pennylane_version=qml.__version__,
            ),
        )
    except SimulationExecutionError:
        raise
    except Exception as exc:
        raise SimulationExecutionError("Local PennyLane state tracing failed") from exc
