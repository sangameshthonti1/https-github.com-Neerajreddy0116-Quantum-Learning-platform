"""Ideal local Aer execution with an explicit pre-measurement state snapshot."""

from secrets import randbits
from time import perf_counter

import qiskit
import qiskit_aer
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from qiskit_aer.library import SaveStatevector

from app.schemas.simulation import (
    ComplexAmplitude,
    ExecutionMetadata,
    SimulationRequest,
    SimulationResponse,
)


class SimulationExecutionError(RuntimeError):
    """The local engine failed; no simulation result should be returned."""


def simulate_circuit(request: SimulationRequest) -> SimulationResponse:
    started = perf_counter()
    seed = request.seed_simulator
    if seed is None:
        seed = randbits(32)

    try:
        circuit = QuantumCircuit(request.num_qubits, request.num_qubits)
        for gate in request.gates:
            match gate.type:
                case "h":
                    circuit.h(gate.targets[0])
                case "x":
                    circuit.x(gate.targets[0])
                case "z":
                    circuit.z(gate.targets[0])
                case "cx":
                    circuit.cx(gate.controls[0], gate.targets[0])
                case _:
                    raise SimulationExecutionError("Unsupported operation reached engine")

        circuit_depth = circuit.depth()
        # Save BEFORE any measurement; a post-measurement trajectory is not the
        # pure state representing the ensemble of sampled outcomes.
        circuit.append(
            SaveStatevector(request.num_qubits, label="ideal_state"),
            range(request.num_qubits),
        )
        circuit.measure(range(request.num_qubits), range(request.num_qubits))

        # Tiny circuits do not benefit from consuming all host CPU cores per request.
        simulator = AerSimulator(
            method="statevector",
            device="CPU",
            precision="double",
            max_parallel_threads=1,
            max_parallel_experiments=1,
            max_parallel_shots=1,
            zero_threshold=0.0,
        )
        compiled = transpile(
            circuit, simulator, optimization_level=0, seed_transpiler=seed
        )
        result = simulator.run(
            compiled, shots=request.shots, seed_simulator=seed
        ).result()
        if not result.success or not result.results[0].success:
            raise SimulationExecutionError(f"Aer execution failed: {result.status}")

        amplitudes = [complex(value) for value in result.data(0)["ideal_state"].data]
        labels = [format(index, f"0{request.num_qubits}b") for index in range(2**request.num_qubits)]
        raw_counts = result.get_counts(0)
        if len(amplitudes) != len(labels) or not set(raw_counts).issubset(labels):
            raise SimulationExecutionError("Aer returned an unexpected basis layout")
        counts = {label: int(raw_counts.get(label, 0)) for label in labels}
        if sum(counts.values()) != request.shots:
            raise SimulationExecutionError("Aer returned an unexpected shot total")

        return SimulationResponse(
            num_qubits=request.num_qubits,
            probabilities={
                label: value.real**2 + value.imag**2
                for label, value in zip(labels, amplitudes, strict=True)
            },
            counts=counts,
            statevector=[
                ComplexAmplitude(real=value.real, imag=value.imag)
                for value in amplitudes
            ],
            shots=request.shots,
            metadata=ExecutionMetadata(
                seed_simulator=seed,
                gate_count=len(request.gates),
                circuit_depth=circuit_depth,
                execution_time_ms=(perf_counter() - started) * 1000,
                qiskit_version=qiskit.__version__,
                aer_version=qiskit_aer.__version__,
            ),
        )
    except SimulationExecutionError:
        raise
    except Exception as exc:
        raise SimulationExecutionError("Local Qiskit Aer execution failed") from exc
