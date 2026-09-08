"""Qiskit unitary evolution and partial traces, with no sampled measurements."""

from time import perf_counter

import numpy as np
import qiskit
from qiskit.circuit.library import CXGate, HGate, XGate, ZGate
from qiskit.quantum_info import Statevector, partial_trace

from app.schemas.simulation import ComplexAmplitude, Gate, SimulationRequest
from app.schemas.trace import (
    BlochVector,
    ReducedQubitState,
    TraceMetadata,
    TraceResponse,
    TraceStep,
)
from app.services.qiskit_simulator import SimulationExecutionError

TOLERANCE = 1e-12
OPERATIONS = {"h": HGate, "x": XGate, "z": ZGate, "cx": CXGate}


def _amplitude(value: complex) -> ComplexAmplitude:
    return ComplexAmplitude(real=float(value.real), imag=float(value.imag))


def _snapshot(state: Statevector, index: int, gate: Gate | None) -> TraceStep:
    """Copy a snapshot; retaining a subsystem means tracing out all the others."""
    if not np.isfinite(state.data).all() or not state.is_valid(atol=TOLERANCE, rtol=0):
        raise SimulationExecutionError("Qiskit returned a nonfinite or unnormalized state")

    num_qubits = state.num_qubits
    qubits = []
    for qubit in range(num_qubits):
        reduced = partial_trace(state, [q for q in range(num_qubits) if q != qubit])
        rho = reduced.data
        if not np.isfinite(rho).all() or not reduced.is_valid(atol=TOLERANCE, rtol=0):
            raise SimulationExecutionError("Qiskit returned an invalid reduced density matrix")
        # rho = (I + x X + y Y + z Z)/2 in the local |0>, |1> basis.
        # rho[0, 1] = (x - i*y)/2, so the minus sign for y is essential.
        qubits.append(ReducedQubitState(
            qubit=qubit,
            density_matrix=tuple(tuple(_amplitude(value) for value in row) for row in rho),
            bloch_vector=BlochVector(
                x=float(2 * rho[0, 1].real),
                y=float(-2 * rho[0, 1].imag),
                z=float(rho[0, 0].real - rho[1, 1].real),
            ),
        ))

    # Native phases and floating-point residuals are preserved. Do not round,
    # independently rephase, or infer a pure vector from a mixed reduced state.
    return TraceStep(
        index=index,
        gate=gate,
        statevector=[_amplitude(value) for value in state.data],
        probabilities={
            format(i, f"0{num_qubits}b"): float(value.real**2 + value.imag**2)
            for i, value in enumerate(state.data)
        },
        qubits=qubits,
    )


def trace_circuit(request: SimulationRequest) -> TraceResponse:
    started = perf_counter()
    try:
        state = Statevector.from_int(0, 2**request.num_qubits)
        steps = [_snapshot(state, 0, None)]
        for index, gate in enumerate(request.gates, start=1):
            # CX's Qiskit argument order is control, target. Request validation
            # already guarantees supported gates, distinct qubits and all bounds.
            operation = OPERATIONS[gate.type]()
            state = state.evolve(operation, qargs=gate.controls + gate.targets)
            steps.append(_snapshot(state, index, gate))

        return TraceResponse(
            num_qubits=request.num_qubits,
            basis_order=[format(i, f"0{request.num_qubits}b") for i in range(2**request.num_qubits)],
            steps=steps,
            metadata=TraceMetadata(
                gate_count=len(request.gates),
                step_count=len(steps),
                execution_time_ms=(perf_counter() - started) * 1000,
                qiskit_version=qiskit.__version__,
            ),
        )
    except SimulationExecutionError:
        raise
    except Exception as exc:
        raise SimulationExecutionError("Local Qiskit state tracing failed") from exc
