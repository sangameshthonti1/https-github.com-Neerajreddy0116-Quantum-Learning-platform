"""Trusted, versioned curriculum. Reference circuits stay on the server."""

from dataclasses import dataclass
from math import sqrt
from types import MappingProxyType

from app.schemas.challenges import ChallengeDefinition
from app.schemas.simulation import ComplexAmplitude, SimulationRequest


def circuit(n: int, operations: tuple = ()) -> SimulationRequest:
    return SimulationRequest.model_validate({
        "numQubits": n, "shots": 1024, "backend": "qiskit", "seedSimulator": 42,
        "gates": [{"id": f"step-{i + 1}", "type": op[0], "targets": [op[1]],
                   "controls": [op[2]] if len(op) == 3 else []}
                  for i, op in enumerate(operations)],
    })


@dataclass(frozen=True)
class TrustedChallenge:
    public: ChallengeDefinition
    reference: SimulationRequest


def define(id, title, difficulty, objective, statement, n, target, label,
           solution, hints, preparation=(), initial=None, distribution=False):
    allowed = ["h", "x", "z"] + (["cx"] if n > 1 else [])
    constraints = [f"Use exactly {n} qubit{'s' if n > 1 else ''}.",
                   f"Allowed gates: {', '.join(g.upper() for g in allowed)}. Maximum 256 gates (Lab resource limit)."]
    if preparation:
        constraints.append(f"Keep the first {len(preparation)} preparation steps in their original order, on the original qubits. Add your solution after them. Reset restores this preparation.")
    vector = [complex(a) for a in target]
    public = ChallengeDefinition(
        id=id, title=title, difficulty=difficulty, objective=objective, statement=statement,
        initial_state=initial or f"|{'0' * n}⟩", starting_circuit=circuit(n, preparation),
        allowed_gates=allowed, preparation_steps=len(preparation), constraints=constraints,
        criterion="distribution" if distribution else "state", target_label=label,
        target_state=None if distribution else [ComplexAmplitude(real=a.real, imag=a.imag) for a in vector],
        target_probabilities={format(i, f"0{n}b"): abs(a)**2 for i, a in enumerate(vector)}, hints=hints,
    )
    return TrustedChallenge(public, circuit(n, preparation + solution))


s = sqrt(0.5)
_catalog = [
    define("flip", "A change of bit", "First steps", "Turn a definite zero into a definite one.",
           "Starting with one qubit in |0⟩, build a circuit that finishes in |1⟩. Every ideal measurement should give 1.",
           1, [0, 1], "|1⟩", (("x", 0),),
           ["You need to change the qubit's value, not just its phase.", "Look for the gate that exchanges |0⟩ and |1⟩.", "The X gate is a quantum bit flip. Decide which wire it belongs on."]),
    define("superposition", "Two possibilities", "First steps", "Prepare equal amplitudes with the same relative phase.",
           "Create |+⟩: equal positive amplitudes for |0⟩ and |1⟩. Equal measurement chances alone are not enough; the relative phase matters.",
           1, [s, s], "(|0⟩ + |1⟩) / √2", (("h", 0),),
           ["A bit flip still leaves only one possible outcome.", "Look for a gate that spreads the amplitude across two basis states.", "Hadamard maps a definite |0⟩ to an equal, same-phase superposition."]),
    define("interference", "Bring it back", "Building intuition", "Recombine a prepared superposition through interference.",
           "The first H gate prepares |+⟩ for you. Keep it and append gates that return the qubit to |0⟩. Use State Explorer to see the |1⟩ amplitude disappear.",
           1, [1, 0], "|0⟩", (("h", 0),),
           ["You are undoing a coherent superposition, not measuring it.", "A gate can be its own inverse.", "Think about how a second Hadamard recombines the two amplitudes."],
           preparation=(("h", 0),), initial="|+⟩ after the provided H"),
    define("phase", "The minus makes a difference", "Building intuition", "Control relative phase without changing measurement chances.",
           "Prepare |−⟩ from |0⟩: the |0⟩ and |1⟩ amplitudes must have equal size and opposite signs. A common phase on both amplitudes is equivalent.",
           1, [s, -s], "(|0⟩ − |1⟩) / √2", (("h", 0), ("z", 0)),
           ["First give both basis states some amplitude.", "Changing just one amplitude's sign changes the relative phase.", "Z leaves |0⟩ alone and reverses the sign of the |1⟩ amplitude."]),
    define("bell", "Connected possibilities", "Making connections", "Entangle two qubits in a Bell state.",
           "From |00⟩, prepare the Bell state (|00⟩ + |11⟩)/√2. The two allowed outcomes have equal chances and the same relative phase.",
           2, [s, 0, 0, s], "(|00⟩ + |11⟩) / √2", (("h", 0), ("cx", 1, 0)),
           ["Start by creating superposition on one qubit.", "The other qubit must follow the first in each branch of the superposition.", "Use a controlled operation with the superposed qubit as control. Check the control and target wires."]),
    define("ghz", "Three in harmony", "Making connections", "Extend entanglement across three qubits.",
           "Prepare a three-qubit GHZ state from |000⟩. Only |000⟩ and |111⟩ should have amplitude, equally and with the same relative phase.",
           3, [s, 0, 0, 0, 0, 0, 0, s], "(|000⟩ + |111⟩) / √2", (("h", 0), ("cx", 1, 0), ("cx", 2, 1)),
           ["You need one coherent choice shared by three qubits.", "First connect two qubits as in the Bell challenge.", "Extend that correlation to the remaining qubit with another controlled operation."]),
    define("unwind", "Untangle the pair", "Making connections", "Reverse an entangling circuit in the correct order.",
           "A Bell pair is prepared by the first H and CX steps. Keep those steps, then append a circuit that returns the entire pair to |00⟩.",
           2, [1, 0, 0, 0], "|00⟩", (("cx", 1, 0), ("h", 0)),
           ["Quantum gates here are reversible; entanglement can be undone coherently.", "To undo several operations, consider their order as well as their inverses.", "Undo the controlled operation before recombining the superposition."],
           preparation=(("h", 0), ("cx", 1, 0)), initial="Bell pair after the provided H → CX"),
    define("opposites", "Always opposite", "Building intuition", "Construct a specified joint measurement distribution.",
           "From |00⟩, make the two measured bits always disagree: 50% |01⟩ and 50% |10⟩. This challenge checks only the exact ideal distribution; any relative phase is accepted.",
           2, [0, s, s, 0], "P(01) = P(10) = ½", (("h", 0), ("cx", 1, 0), ("x", 1)),
           ["Independent random bits also produce equal bits, which are unwanted here.", "Start with correlated outcomes, then change one of the bits.", "Flipping exactly one wire of a Bell pair turns agreement into disagreement."], distribution=True),
]
CATALOG = MappingProxyType({c.public.id: c for c in _catalog})
