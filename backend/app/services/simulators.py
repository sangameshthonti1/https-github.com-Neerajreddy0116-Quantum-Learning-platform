"""Two explicit adapters over one validated circuit and result contract.

Imports are lazy: choosing Qiskit does not import or initialize PennyLane.
Each engine owns its construction, execution and tracing. No fallback occurs.
"""

from collections.abc import Callable
from dataclasses import dataclass

from app.schemas.simulation import SimulationRequest, SimulationResponse, SimulatorBackend
from app.schemas.trace import TraceResponse
from app.services.simulation_errors import SimulationExecutionError


@dataclass(frozen=True)
class SimulatorAdapter:
    simulate: Callable[[SimulationRequest], SimulationResponse]
    trace: Callable[[SimulationRequest], TraceResponse]


def get_simulator(backend: SimulatorBackend) -> SimulatorAdapter:
    if backend == "qiskit":
        from app.services import qiskit_simulator, qiskit_trace
        return SimulatorAdapter(qiskit_simulator.simulate_circuit, qiskit_trace.trace_circuit)
    if backend == "pennylane":
        try:
            from app.services import pennylane_simulator
        except ImportError as exc:
            raise SimulationExecutionError("PennyLane installation is unavailable") from exc
        return SimulatorAdapter(pennylane_simulator.simulate_circuit, pennylane_simulator.trace_circuit)
    raise SimulationExecutionError("Unsupported simulator backend")


def simulate_circuit(request: SimulationRequest) -> SimulationResponse:
    return get_simulator(request.backend).simulate(request)


def trace_circuit(request: SimulationRequest) -> TraceResponse:
    return get_simulator(request.backend).trace(request)
