"""Approved excerpts, deliberately excluding quiz answers, grades and evidence.

Reviewed against curriculum checkpoint 9b12c6c. Update alongside lesson changes.
Sources: frontend/src/lesson/foundations/content.ts, lesson/ConceptStages.tsx,
and app/curriculum.ts. Only the requested lesson is included in a provider call.
"""

LESSONS = {
    "measurement": {
        "title": "Qubits and measurement",
        "objectives": ["Explain bits, qubits, and basis states", "Prepare |0⟩ and |1⟩ using empty and X circuits", "Distinguish ideal probabilities from sampled counts"],
        "excerpts": [
            "A qubit is a quantum system used to carry information. You do not need to know how the hardware is made to learn its rules. We describe its state: the mathematical information needed to predict what operations and readings will do.",
            "The two reference states |0⟩ and |1⟩ are called computational basis states. Read |0⟩ as “state zero”. The brackets mark a quantum state; they are not extra bits. Measuring these states in this basis gives 0 and 1 respectively, with certainty.",
            "Measurement is an interaction that produces a classical record. In this app the computational basis is the reading choice: the possible records are 0 and 1 for each qubit. One reading gives one outcome, not the whole list of amplitudes.",
            "An ideal probability comes from the state in the noiseless model. A sampled count records how often an outcome appeared in actual simulator readings. A shot means preparing the starting state, applying all gates, and measuring once.",
        ],
    },
    "superposition": {
        "title": "Superposition & the Hadamard gate",
        "objectives": ["Read amplitudes and probabilities", "Build and test H and H → H", "Explain interference from your observations"],
        "excerpts": [
            "H changes the amplitudes in a fixed, repeatable way. It does not randomly choose a bit inside the gate. We get a sampled 0 or 1 when we measure afterward.",
            "Probability = squared magnitude of amplitude. “Squared” means multiplied by itself.",
            "For a complex amplitude with real part a and imaginary part b, its squared magnitude is a² + b². The imaginary part is another numerical component, not an “imaginary” probability.",
            "The first H leaves two positive amplitudes. The second H combines contributions from both. For the zero amplitude, those contributions have the same sign and add. For the one amplitude, they have opposite signs and cancel.",
            "This depends on not measuring between the gates. A real intermediate reading changes the state. The Explorer calculates intermediate states without performing that reading; each sampled Lab run measures only at the end.",
        ],
    },
    "phase": {
        "title": "Phase and interference",
        "objectives": ["Distinguish relative phase from an overall sign", "Build and compare H → H and H → Z → H", "Explain reinforcement and cancellation of amplitudes"],
        "excerpts": [
            "Phase describes how amplitudes are oriented relative to each other. General phases need complex numbers, which have real and imaginary parts. Here all imaginary parts are zero, so matching versus opposite signs is enough. Opposite signs mean a relative phase difference of half a turn, also called π radians.",
            "Z leaves the |0⟩ amplitude alone and reverses the sign of the |1⟩ amplitude. It does not exchange the labels 0 and 1. Unlike X, it does not swap the amplitudes.",
            "Your two experiments began in the same state and used the same first and last gates. Inserting Z changed the relative sign between the components, and that changed which contributions cancelled at the last H.",
        ],
    },
    "entanglement": {
        "title": "Entanglement and Bell states",
        "objectives": ["Read two-qubit labels in q1 q0 order", "Build H(q0) → CX(q0 → q1) and inspect three trace steps", "Explain a pure joint Bell state with maximally mixed individual states"],
        "excerpts": [
            "Start in |00⟩. H on q0 makes equal positive amplitudes for |00⟩ and |01⟩; q1 has not changed yet. CX(q0 → q1) then leaves the first component alone and changes the second to |11⟩.",
            "A reduced state describes only one part of a larger system, when the other part is ignored. Reducing is a mathematical view; we do not measure or physically remove the other qubit. A mixed state cannot be described by a single pure-state vector for that part.",
            "The Bloch sphere maps a single-qubit state. Pure states lie on its surface; mixed states lie inside. A maximally mixed state is at the center, with vector (0, 0, 0). That does not mean the qubit is absent or the simulator failed.",
            "The centered spheres alone are not proof: a classical 50/50 mixture of 00 and 11 has the same reduced states. It is the full joint state that distinguishes them. Correlation also does not let one observer choose the other’s random outcome or send a message instantly.",
        ],
    },
}
