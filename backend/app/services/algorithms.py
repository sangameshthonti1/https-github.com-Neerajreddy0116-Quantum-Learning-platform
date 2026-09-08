"""Trusted gate builders and interpretation of actual Qiskit outputs, never lookup results."""

from hashlib import sha256
import json

from app.schemas.algorithms import (
    AlgorithmDefinition, AlgorithmRequest, AlgorithmRun, AlgorithmStage, DeutschJozsaRequest,
    DeutschJozsaInterpretation, GroverInterpretation, IterationObservation,
)
from app.schemas.simulation import SimulationRequest
from app.services.algorithm_catalog import ORACLES, oracle_definition
from app.services.qiskit_simulator import SimulationExecutionError, simulate_circuit
from app.services.qiskit_trace import trace_circuit

TOLERANCE = 1e-10


class CircuitBuilder:
    def __init__(self):
        self.gates = []
        self.stages = []

    def gate(self, kind, target, controls=()):
        self.gates.append({"id": f"algorithm-{len(self.gates) + 1}", "type": kind,
                           "targets": [target], "controls": list(controls)})

    def stage(self, stage_id, title, description, iteration=None):
        self.stages.append(AlgorithmStage(
            id=stage_id, title=title, description=description,
            start_step=self.stages[-1].end_step if self.stages else 0,
            end_step=len(self.gates), iteration=iteration,
        ))

    def phase_mark(self, bits):
        # Map the selected basis state to all ones, apply Z / CZ, uncompute.
        zero_qubits = [q for q, bit in enumerate(reversed(bits)) if bit == "0"]
        for q in zero_qubits:
            self.gate("x", q)
        self.gate("z", 0) if len(bits) == 1 else self.gate("cz", 1, (0,))
        for q in reversed(zero_qubits):
            self.gate("x", q)


def build_algorithm(parameters: AlgorithmRequest) -> AlgorithmDefinition:
    b = CircuitBuilder()
    oracle, ancilla = None, None
    if isinstance(parameters, DeutschJozsaRequest):
        n = parameters.input_qubits
        ancilla = n
        oracle = oracle_definition(parameters.oracle_id, n)
        b.gate("x", ancilla)
        b.stage("prepare", "Prepare the helper", "X flips the helper (ancilla) from 0 to 1. The input register starts at all zeros.")
        for q in range(n + 1):
            b.gate("h", q)
        b.stage("superposition", "Create superposition", "H gives every input equal amplitude. On the helper, H after X creates equal amplitudes with opposite signs: |−⟩.")
        mask, offset, _ = ORACLES[parameters.oracle_id]
        if offset:
            b.gate("x", ancilla)
        for q in range(n):
            if mask & (1 << q):
                b.gate("cx", ancilla, (q,))
        b.stage("oracle", "Query the oracle", "The reversible oracle keeps the input and flips the helper exactly when f(input)=1. Because flipping |−⟩ reverses its sign, those input amplitudes acquire a minus sign. This is phase kickback." + (" Always 0 is the identity: it needs no gates." if parameters.oracle_id == "zero" else ""))
        for q in range(n):
            b.gate("h", q)
        b.stage("interference", "Interfere & read inputs", "Final H gates mix the signed input amplitudes. All-zero input means constant; any nonzero input means balanced, under the promise. The helper is not part of this decision.")
        qubits = n + 1
    else:
        n = qubits = parameters.num_qubits
        for q in range(n):
            b.gate("h", q)
        b.stage("superposition", "Uniform superposition", "H creates equal amplitudes for all items. A measurement now has the same chance of returning each item.", iteration=0)
        for iteration in range(1, parameters.iterations + 1):
            b.phase_mark(parameters.marked_item)
            b.stage(f"oracle-{iteration}", f"{iteration} · Phase oracle", "Only the marked item's amplitude changes sign. Its squared magnitude, and therefore its immediate measurement probability, is unchanged.", iteration)
            for q in range(n):
                b.gate("h", q)
            b.phase_mark("0" * n)
            for q in range(n):
                b.gate("h", q)
            b.stage(f"diffuser-{iteration}", f"{iteration} · Diffuser", "Reflect amplitudes about their average, up to an overall minus sign. Relative signs turn into changed probabilities. Repeating can amplify or reduce the marked probability; inspect the observed value.", iteration)
    circuit = SimulationRequest.model_validate({
        "numQubits": qubits, "gates": b.gates, "shots": parameters.shots,
        "backend": "qiskit", "seedSimulator": parameters.seed_simulator,
    })
    digest = sha256(json.dumps(circuit.model_dump(by_alias=True), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return AlgorithmDefinition(parameters=parameters, circuit=circuit, circuit_digest=digest,
                               stages=b.stages, input_register=list(range(n)), ancilla_qubit=ancilla, oracle=oracle)


def run_algorithm(parameters: AlgorithmRequest) -> AlgorithmRun:
    definition = build_algorithm(parameters)
    simulation = simulate_circuit(definition.circuit)
    trace = trace_circuit(definition.circuit)
    # Independent execution paths must describe the same state, including native phase.
    for a, b in zip(simulation.statevector, trace.steps[-1].statevector, strict=True):
        if abs(complex(a.real, a.imag) - complex(b.real, b.imag)) > TOLERANCE:
            raise SimulationExecutionError("Algorithm simulation and trace disagree")
    if isinstance(parameters, DeutschJozsaRequest):
        n = parameters.input_qubits
        probabilities = {format(x, f"0{n}b"): 0.0 for x in range(2**n)}
        counts = dict.fromkeys(probabilities, 0)
        for label, probability in simulation.probabilities.items():
            # Ancilla q[n] is the leftmost bit; inputs are the n rightmost bits.
            probabilities[label[-n:]] += probability
            counts[label[-n:]] += simulation.counts[label]
        zero = probabilities["0" * n]
        classification = "constant" if abs(1 - zero) <= TOLERANCE else "balanced" if zero <= TOLERANCE else "inconclusive"
        explanation = {
            "constant": "The input register is all zeros with ideal probability 100% within numerical tolerance. Under the constant-or-balanced promise, this identifies a constant function. Both helper outcomes count toward the same input result.",
            "balanced": "The all-zero input has ideal probability 0% within numerical tolerance. Measuring the input gives at least one 1, identifying a balanced function under the promise. The helper bit is excluded.",
            "inconclusive": "The simulated input distribution does not identify a promised case within tolerance. No classification can be concluded from this run.",
        }[classification]
        interpretation = DeutschJozsaInterpretation(
            classification=classification, input_probabilities=probabilities, input_counts=counts,
            zero_input_probability=zero, classical_worst_case_queries=2**(n - 1) + 1, explanation=explanation,
        )
    else:
        marked = parameters.marked_item
        success = simulation.probabilities[marked]
        observations = [IterationObservation(iteration=s.iteration, step=s.end_step,
                        success_probability=trace.steps[s.end_step].probabilities[marked])
                        for s in definition.stages if s.id == "superposition" or s.id.startswith("diffuser-")]
        iteration_word = "iteration" if parameters.iterations == 1 else "iterations"
        explanation = (f"The simulated ideal probability of item {marked} after {parameters.iterations} {iteration_word} is {success:.2%}. "
                       f"Aer sampled it {simulation.counts[marked]} times in {simulation.shots} shots. "
                       "Each shot measures one item; the ideal probability comes from squared amplitude, while counts come from repeated measurements. "
                       + ("With two items and one mark, standard Grover iterations keep success at 50%; there is no amplification advantage in this example."
                          if parameters.num_qubits == 1 else "Compare the recorded iteration boundaries: extra iterations can move probability away from the marked item."))
        interpretation = GroverInterpretation(marked_item=marked, success_probability=success,
            sampled_success_count=simulation.counts[marked], sampled_success_rate=simulation.counts[marked] / simulation.shots,
            iterations=observations, explanation=explanation)
    return AlgorithmRun(definition=definition, simulation=simulation, trace=trace, interpretation=interpretation)
