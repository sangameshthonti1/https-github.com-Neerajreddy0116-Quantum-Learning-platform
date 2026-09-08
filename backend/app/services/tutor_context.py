"""Recompute facts locally; never ingest client probabilities or model results."""

from app.schemas.simulation import SimulationRequest
from app.schemas.tutor import CircuitFacts, TutorRequest
from app.services.qiskit_trace import trace_circuit
from app.services.tutor_lessons import LESSONS


def circuit_facts(circuit: SimulationRequest, selected: int | None) -> CircuitFacts:
    trace = trace_circuit(circuit)
    index = len(circuit.gates) if selected is None else selected
    indices = range(len(trace.steps)) if len(circuit.gates) <= 16 else sorted({0, 1, max(0, index - 1), index, len(circuit.gates)})
    return CircuitFacts(circuit=circuit, selected_step=index, snapshots=[trace.steps[i] for i in indices], total_steps=len(trace.steps))


def build_context(request: TutorRequest) -> tuple[dict, CircuitFacts | None]:
    facts = circuit_facts(request.circuit, request.selected_step) if request.circuit else None
    context = {
        "lesson": LESSONS.get(request.lesson_id),
        "circuit": None,
        "limits": {"qubits": [1, 3], "gates": ["h", "x", "z", "cx"], "maxGates": 256, "maxSuggestedGates": 32},
        "measurement": "Ideal pre-measurement states. No sampling performed for this answer. Shots and seeds are not counts. Do not infer the student's sampled counts.",
    }
    if facts:
        context["circuit"] = {
            "source": facts.source, "numQubits": facts.circuit.num_qubits,
            "initialState": "0" * facts.circuit.num_qubits, "bitOrder": facts.bit_order,
            # Gate IDs are opaque client text, irrelevant to physics; never sent.
            "orderedGates": [{"step": i, "type": g.type, "targets": g.targets, "controls": g.controls} for i, g in enumerate(facts.circuit.gates, 1)],
            "selectedStep": facts.selected_step, "totalSteps": facts.total_steps,
            "snapshotsComplete": len(facts.snapshots) == facts.total_steps,
            "snapshots": [{
                "index": step.index, "probabilities": step.probabilities,
                "statevector": [a.model_dump() for a in step.statevector],
                "reducedQubits": [{"qubit": q.qubit, "blochVector": q.bloch_vector.model_dump()} for q in step.qubits],
            } for step in facts.snapshots],
        }
    return context, facts
