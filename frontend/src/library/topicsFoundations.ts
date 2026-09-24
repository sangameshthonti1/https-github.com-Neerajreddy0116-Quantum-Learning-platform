import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const foundationTopics: readonly LibraryTopic[] = [
  {
    slug: "classical-information-and-bits",
    title: "Classical information and bits",
    category: "Foundations",
    level: "Beginner",
    updated,
    summary:
      "How yes-or-no choices become binary information, how bit strings scale, and why uncertainty about a classical bit is not quantum superposition.",
    terms: [
      {
        term: "Bit",
        definition:
          "A binary digit—the basic unit of classical information, represented as 0 or 1.",
      },
      {
        term: "Bit string",
        definition: "An ordered sequence of bits, such as 1011.",
      },
      { term: "Byte", definition: "A group of eight classical bits." },
      {
        term: "Classical uncertainty",
        definition: "Not knowing a value that is nevertheless definite.",
      },
    ],
    sections: [
      {
        id: "information-as-choice",
        title: "Information begins with distinguishable choices",
        paragraphs: [
          "At an introductory level, information helps us distinguish possibilities. A question such as “Is the light on?” has two answers. We can label one 0 and the other 1 so a physical device can store the choice.",
          "The labels are symbols for two alternatives; they do not need to mean false and true in every context. A bit stores one such binary choice.",
        ],
        note: {
          title: "Informal starting point",
          text: "Formal information theory connects this intuition to random variables, coding, and Shannon entropy.",
        },
      },
      {
        id: "combining-bits",
        title: "Combining bits",
        paragraphs: [
          "Several bits form a bit string. Two bits have four possible strings—00, 01, 10, and 11. Four bits have sixteen strings, and 1011 is one of them. Eight bits are conventionally called a byte.",
        ],
        equation: {
          notation: "n classical bits → 2ⁿ possible bit strings",
          explanation:
            "The number of possible strings doubles with each added bit.",
        },
        bullets: [
          "1 bit → 2 strings",
          "2 bits → 4 strings",
          "3 bits → 8 strings",
          "4 bits → 16 strings",
          "10 bits → 1,024 strings",
        ],
      },
      {
        id: "physical-bits",
        title: "Bits need physical representations",
        paragraphs: [
          "Computers represent 0 and 1 using distinguishable physical conditions such as ranges of voltage, magnetization, or stored charge. The logical bit is an abstraction, so different hardware can implement the same information model.",
        ],
      },
      {
        id: "unknown-is-not-superposition",
        title: "Unknown is not the same as superposition",
        paragraphs: [
          "A coin hidden under a cup has one classical value even when you do not know it. Your uncertainty is missing knowledge.",
          "A coherent quantum superposition is instead described by amplitudes and relative phase. Those amplitudes can later interfere. A classical probability distribution over 0 and 1 does not contain that phase information.",
        ],
        note: {
          title: "Key distinction",
          text: "A classical mixture represents uncertainty over alternatives; a coherent superposition can produce interference.",
        },
      },
      {
        id: "toward-qubits",
        title: "From bits to qubits",
        paragraphs: [
          "Quantum computing keeps two labeled basis states but uses a qubit as its elementary information carrier. A qubit is not simply a faster or smaller bit: quantum algorithms transform amplitudes, phase, interference, and multi-qubit correlations before measurement.",
        ],
      },
    ],
    sources: [
      suppliedNotes("Information & Qubits; A Different Kind of Bit"),
      textbook,
    ],
    downloads: [
      download("Beginner notes · Parts 01–02", "beginner-part-01.pdf"),
      download("Bits and qubits · Parts 09–10", "beginner-part-05.pdf"),
    ],
    relatedSlugs: ["qubits-and-superposition", "multi-qubit-state-spaces"],
  },
  {
    slug: "qubits-and-superposition",
    title: "Qubits, basis states, and superposition",
    category: "Foundations",
    level: "Beginner",
    updated,
    summary:
      "Ket notation, pure qubit states, normalization, superposition, physical qubits, and what a measurement can—and cannot—reveal.",
    terms: [
      {
        term: "Qubit",
        definition:
          "A two-level quantum system used as a unit of quantum information.",
      },
      {
        term: "Computational basis",
        definition: "The basis states |0⟩ and |1⟩.",
      },
      { term: "Ket", definition: "Dirac notation for a state, such as |ψ⟩." },
      {
        term: "Superposition",
        definition:
          "A coherent linear combination of basis states, defined relative to a basis.",
      },
      {
        term: "Amplitude",
        definition:
          "A generally complex coefficient attached to a basis-state component.",
      },
    ],
    sections: [
      {
        id: "basis-states",
        title: "Computational-basis states",
        paragraphs: [
          "A qubit has two standard basis states, |0⟩ and |1⟩, read “ket zero” and “ket one.” The symbols name quantum states, not ordinary numbers.",
          "A computational-basis measurement of |0⟩ gives 0 with certainty; |1⟩ gives 1 with certainty.",
        ],
      },
      {
        id: "general-state",
        title: "The general pure state",
        paragraphs: [
          "A pure qubit state is a linear combination of its basis states. The coefficients α and β are complex amplitudes containing magnitude and phase information.",
          "Normalization makes the total probability equal to one.",
        ],
        equation: {
          notation: "|ψ⟩ = α|0⟩ + β|1⟩,  α,β ∈ ℂ,  |α|² + |β|² = 1",
          explanation:
            "The squared magnitudes become computational-basis probabilities.",
        },
      },
      {
        id: "equal-superpositions",
        title: "Equal superpositions",
        paragraphs: [
          "The states |+⟩ and |−⟩ have equal amplitude magnitudes. Both give 50–50 computational-basis measurements, but their relative signs differ and later gates can distinguish them.",
        ],
        equation: {
          notation: "|+⟩=(|0⟩+|1⟩)/√2     |−⟩=(|0⟩−|1⟩)/√2",
          explanation:
            "Equal probability bars do not imply equal quantum states.",
        },
      },
      {
        id: "not-a-hidden-bit",
        title: "Not a hidden classical bit",
        paragraphs: [
          "Calling a superposition “secretly 0 or 1” misses coherent relative phase. A classical 50–50 mixture cannot reproduce every interference effect of |+⟩ and |−⟩.",
          "Superposition is basis-dependent: |+⟩ is a superposition in the computational basis but is a definite state in the X basis.",
        ],
      },
      {
        id: "one-result",
        title: "One measurement gives one result",
        paragraphs: [
          "A single computational-basis measurement records 0 or 1. It does not display both outcomes or reveal the amplitudes and phase.",
          "Estimating an unknown state requires many identically prepared systems measured in several bases, a process called state tomography.",
        ],
      },
      {
        id: "physical-qubits",
        title: "Physical qubits",
        paragraphs: [
          "Hardware can encode qubits in superconducting circuits, trapped ions, photons, neutral atoms, or spins. Experimenters identify two states as |0⟩ and |1⟩, control their evolution, and measure outcomes.",
          "The ket model here describes pure states. Mixed states and noisy systems generally require density matrices.",
        ],
      },
    ],
    sources: [suppliedNotes("Meet a Qubit; A Different Kind of Bit"), textbook],
    downloads: [
      download("Information and qubits · Parts 01–02", "beginner-part-01.pdf"),
      download("Bits and qubits · Parts 09–10", "beginner-part-05.pdf"),
    ],
    relatedSlugs: [
      "amplitudes-and-the-born-rule",
      "quantum-measurement",
      "phase-in-quantum-states",
    ],
  },
  {
    slug: "amplitudes-and-the-born-rule",
    title: "Amplitudes, normalization, and the Born rule",
    category: "Foundations",
    level: "Beginner",
    updated,
    summary:
      "Why amplitudes are not probabilities, how squared magnitudes become probabilities, and how to check normalization with worked examples.",
    terms: [
      {
        term: "Born rule",
        definition:
          "Probability equals the squared magnitude of the corresponding amplitude.",
      },
      {
        term: "Normalization",
        definition: "The requirement that probabilities sum to one.",
      },
      {
        term: "Complex magnitude",
        definition: "For amplitude a, |a|²=a* a is real and non-negative.",
      },
      {
        term: "Statevector",
        definition: "The ordered list of basis-state amplitudes.",
      },
    ],
    sections: [
      {
        id: "rule",
        title: "From amplitude to probability",
        paragraphs: [
          "Amplitudes can be real, negative, or complex. Probabilities must be real and between zero and one. The Born rule converts each amplitude into a probability by taking its squared magnitude—not by simply squaring a general complex number.",
        ],
        equation: {
          notation: "P(0)=|α|²     P(1)=|β|²     |α|²+|β|²=1",
          explanation:
            "The normalization condition ensures that one of the possible outcomes occurs.",
        },
      },
      {
        id: "deterministic-examples",
        title: "Amplitudes zero and one",
        paragraphs: [
          "For |ψ⟩=1|0⟩, P(0)=1 and the result is certainly 0. For |ψ⟩=0|0⟩+1|1⟩, P(1)=1 and the result is certainly 1.",
        ],
      },
      {
        id: "equal-example",
        title: "The 50–50 example",
        paragraphs: [
          "In |+⟩, both amplitudes are 1/√2≈0.7071. Their squared magnitudes are one half, so each computational-basis outcome has probability 50%.",
        ],
        equation: {
          notation: "|1/√2|² = 1/2",
          explanation:
            "An amplitude of about 0.7071 corresponds to a probability of about 0.5.",
        },
      },
      {
        id: "unequal-example",
        title: "A 75–25 example",
        paragraphs: [
          "For |ψ⟩=(√3/2)|0⟩+(1/2)|1⟩, the probabilities are 3/4 and 1/4. They sum to one.",
        ],
        equation: {
          notation: "P(0)=|√3/2|²=3/4     P(1)=|1/2|²=1/4",
          explanation:
            "The qubit is more likely to produce 0, but a single shot can still produce 1.",
        },
      },
      {
        id: "negative-amplitude",
        title: "A minus sign is not negative probability",
        paragraphs: [
          "For (|0⟩−|1⟩)/√2, the |1⟩ amplitude is negative in this real-valued example, but its probability is still one half.",
          "The relative sign remains physically important because later operations can make amplitude contributions reinforce or cancel. A common sign multiplying the entire state is instead a global phase.",
        ],
      },
      {
        id: "amplitude-comparison",
        title: "Amplitude versus probability",
        paragraphs: [
          "Amplitudes describe the state and can contain phase; probabilities describe measurement chances and are non-negative. For a normalized single qubit, each amplitude magnitude is at most one, even though its real or imaginary components are not probabilities.",
        ],
        bullets: [
          "Amplitude: generally complex; can carry relative phase.",
          "Probability: real and between 0 and 1.",
          "Amplitude → squared magnitude → probability.",
          "Probabilities over a complete measurement sum to 1.",
        ],
      },
    ],
    sources: [suppliedNotes("From Amplitudes to the H Gate"), textbook],
    downloads: [
      download("Amplitudes and H gate · Parts 11–12", "beginner-part-06.pdf"),
    ],
    relatedSlugs: [
      "qubits-and-superposition",
      "quantum-measurement",
      "sampling-shots-and-counts",
    ],
  },
  {
    slug: "quantum-circuits-and-x-gate",
    title: "Quantum circuits and the Pauli-X gate",
    category: "Gates & circuits",
    level: "Beginner",
    updated,
    summary:
      "How to read a circuit, use an empty circuit as a baseline, and understand X as a reversible basis-state flip.",
    terms: [
      {
        term: "Quantum circuit",
        definition:
          "An ordered model of preparation, operations, and measurement.",
      },
      {
        term: "Identity",
        definition: "The operation I that leaves every state unchanged.",
      },
      {
        term: "Pauli-X",
        definition: "A single-qubit unitary that exchanges |0⟩ and |1⟩.",
      },
      {
        term: "Unitary",
        definition: "A reversible norm-preserving operation satisfying U†U=I.",
      },
    ],
    sections: [
      {
        id: "timeline",
        title: "Reading a circuit",
        paragraphs: [
          "A wire represents logical state evolution through an ordered sequence. Read time from left to right. Boxes are gates, while measurement produces classical data.",
          "The wire is a timeline, not necessarily a literal route through space.",
        ],
        bullets: [
          "Prepare the initial state.",
          "Apply gates from left to right.",
          "Track the state after each gate.",
          "Measure in the stated basis.",
          "Compare counts with predicted probabilities.",
        ],
      },
      {
        id: "empty-circuit",
        title: "The no-gate baseline",
        paragraphs: [
          "In the ideal circuit model, an empty wire represents identity evolution: |0⟩ remains |0⟩, |1⟩ remains |1⟩, and |+⟩ remains |+⟩.",
          "Real hardware may accumulate phase, relax, or decohere while idle, so this is an ideal-model statement.",
        ],
        equation: {
          notation: "I|0⟩=|0⟩     I|1⟩=|1⟩",
          explanation: "Identity is the reference operation.",
        },
      },
      {
        id: "x-action",
        title: "X flips computational-basis states",
        paragraphs: [
          "Pauli-X behaves like NOT on basis-state inputs. A circuit |0⟩→X→measurement returns 1 with certainty in the ideal model.",
        ],
        equation: {
          notation: "X=[[0,1],[1,0]]     X|0⟩=|1⟩     X|1⟩=|0⟩",
          explanation: "The matrix exchanges the two statevector entries.",
        },
      },
      {
        id: "general-state",
        title: "X acts linearly on a superposition",
        paragraphs: [
          "For α|0⟩+β|1⟩, X exchanges the basis components. It does not measure them first. The symmetric state |+⟩ is unchanged because swapping equal components gives the same state.",
        ],
        equation: {
          notation: "X(α|0⟩+β|1⟩)=β|0⟩+α|1⟩     X|+⟩=|+⟩",
          explanation: "|+⟩ is a +1 eigenstate of X.",
        },
      },
      {
        id: "x-twice",
        title: "X is its own inverse",
        paragraphs: [
          "The first X flips and the second flips back. X²=I restores the complete state, not only its measurement probabilities.",
        ],
        equation: {
          notation: "X²=I     X(X|ψ⟩)=|ψ⟩",
          explanation: "Ideal unitary gates are reversible.",
        },
      },
      {
        id: "gate-versus-measurement",
        title: "Gate versus measurement",
        paragraphs: [
          "An ideal gate transforms amplitudes reversibly. Measurement records an outcome and generally changes the conditional state. Keeping them distinct prevents the misconception that a gate secretly samples an answer.",
        ],
      },
    ],
    sources: [suppliedNotes("Quantum Circuits; Prepare One With X"), textbook],
    downloads: [
      download("Circuits and X gate · Parts 03–04", "beginner-part-02.pdf"),
    ],
    relatedSlugs: [
      "hadamard-gate",
      "predict-build-and-read-circuits",
      "quantum-measurement",
    ],
  },
  {
    slug: "quantum-measurement",
    title: "Single-qubit measurement",
    category: "Foundations",
    level: "Beginner",
    updated,
    summary:
      "What computational-basis measurement returns, how outcome probabilities are determined, and why one result does not reveal a state.",
    terms: [
      {
        term: "Measurement basis",
        definition: "The set of alternatives a measurement distinguishes.",
      },
      {
        term: "Projective measurement",
        definition: "An ideal measurement modeled with orthogonal projectors.",
      },
      {
        term: "Outcome",
        definition: "The recorded classical result, such as 0 or 1.",
      },
      {
        term: "Post-measurement state",
        definition: "The state conditioned on an observed result.",
      },
    ],
    sections: [
      {
        id: "question",
        title: "What question does measurement ask?",
        paragraphs: [
          "A computational-basis measurement asks whether the qubit is found in the |0⟩ or |1⟩ alternative. The result is the classical bit 0 or 1.",
          "Measurement is basis-dependent; this article uses the ideal computational basis.",
        ],
      },
      {
        id: "deterministic",
        title: "Basis states are deterministic",
        paragraphs: [
          "Measuring |0⟩ gives 0 with probability one; measuring |1⟩ gives 1 with probability one. Quantum probabilities are not always random-looking.",
        ],
        equation: {
          notation: "|0⟩→P(0)=1     |1⟩→P(1)=1",
          explanation:
            "A basis eigenstate produces its matching result with certainty.",
        },
      },
      {
        id: "one-shot",
        title: "A superposition still gives one result",
        paragraphs: [
          "For |+⟩, both probabilities are one half. One shot nevertheless records either 0 or 1—not half of each and not both at once.",
          "The distribution describes many identically prepared trials; it does not predict the exact next result unless a probability is zero or one.",
        ],
      },
      {
        id: "after-measurement",
        title: "Conditional state after ideal measurement",
        paragraphs: [
          "In the introductory projective model, observing 0 leaves |0⟩ and observing 1 leaves |1⟩. Not every physical measurement is perfect, repeatable, or non-destructive, and generalized measurements require broader mathematics.",
        ],
      },
      {
        id: "limits",
        title: "What one measurement cannot reveal",
        paragraphs: [
          "A result does not reveal amplitudes or phase. Even many Z-basis measurements reveal only Z-basis frequencies. State tomography needs many equivalent preparations and several measurement bases.",
        ],
      },
      {
        id: "real-hardware",
        title: "Ideal model and hardware",
        paragraphs: [
          "Preparation, gates, decoherence, and readout can all introduce errors on hardware. The platform therefore separates exact ideal probabilities from sampled counts and metadata.",
        ],
      },
    ],
    sources: [
      suppliedNotes("Measurement & H Gate; Read Your Results"),
      textbook,
    ],
    downloads: [
      download("Measurement and H gate · Parts 05–06", "beginner-part-03.pdf"),
      download("Results and H twice · Parts 15–16", "beginner-part-08.pdf"),
    ],
    relatedSlugs: ["amplitudes-and-the-born-rule", "sampling-shots-and-counts"],
  },
  {
    slug: "hadamard-gate",
    title: "The Hadamard gate",
    category: "Gates & circuits",
    level: "Beginner",
    updated,
    summary:
      "The H matrix, its action on basis states, the |+⟩ and |−⟩ states, and why H changes basis rather than simply adding randomness.",
    terms: [
      {
        term: "Hadamard gate",
        definition:
          "A single-qubit unitary that transforms between the Z and X bases.",
      },
      { term: "|+⟩", definition: "The X-basis state (|0⟩+|1⟩)/√2." },
      { term: "|−⟩", definition: "The X-basis state (|0⟩−|1⟩)/√2." },
      { term: "Self-inverse", definition: "An operation U satisfying U²=I." },
    ],
    sections: [
      {
        id: "matrix",
        title: "Matrix and basis-state action",
        paragraphs: [
          "Hadamard maps computational-basis states to equal-magnitude superpositions with different relative signs.",
        ],
        equation: {
          notation: "H=(1/√2)[[1,1],[1,−1]]     H|0⟩=|+⟩     H|1⟩=|−⟩",
          explanation:
            "The minus sign in H|1⟩ is phase information, not negative probability.",
        },
      },
      {
        id: "matrix-calculation",
        title: "Calculating H|0⟩",
        paragraphs: [
          "Represent |0⟩ as the vector [1,0]ᵀ. Matrix multiplication produces (1/√2)[1,1]ᵀ, which is (|0⟩+|1⟩)/√2. Both computational-basis probabilities are one half.",
        ],
        equation: {
          notation: "H[1,0]ᵀ = (1/√2)[1,1]ᵀ",
          explanation: "A statevector records amplitudes in basis order.",
        },
      },
      {
        id: "not-randomness",
        title: "H does not simply add randomness",
        paragraphs: [
          "H transforms amplitudes coherently. It creates a computational-basis superposition from |0⟩ or |1⟩, but it removes that superposition from |+⟩ or |−⟩.",
          "The classical random result appears only after measurement. Before measurement, phase remains available for interference.",
        ],
        equation: {
          notation: "H|+⟩=|0⟩     H|−⟩=|1⟩",
          explanation: "Hadamard changes between the Z and X bases.",
        },
      },
      {
        id: "compare-x",
        title: "H compared with X",
        paragraphs: [
          "X maps |0⟩ directly to |1⟩. H maps |0⟩ to |+⟩. Both are reversible unitary gates, but they perform different state transformations.",
        ],
      },
      {
        id: "self-inverse",
        title: "H is self-inverse",
        paragraphs: [
          "Applying H twice gives the identity for every single-qubit state. The full derivation and interference picture are developed in the H-twice article.",
        ],
        equation: {
          notation: "H²=I     H(H|ψ⟩)=|ψ⟩",
          explanation:
            "This restores the whole ideal state, not only its probabilities.",
        },
      },
      {
        id: "uses",
        title: "Why H appears in algorithms",
        paragraphs: [
          "Hadamard gates prepare basis-changing superpositions, enable interference, and commonly appear before or after oracle and phase operations. Their usefulness comes from controlled amplitude transformation—not from exposing every answer at once.",
        ],
      },
    ],
    sources: [
      suppliedNotes(
        "Create Equal Chances With H; From Amplitudes to the H Gate",
      ),
      textbook,
    ],
    downloads: [
      download("Measurement and H gate · Parts 05–06", "beginner-part-03.pdf"),
      download("Amplitudes and H gate · Parts 11–12", "beginner-part-06.pdf"),
    ],
    relatedSlugs: [
      "interference-and-h-twice",
      "phase-in-quantum-states",
      "quantum-circuits-and-x-gate",
    ],
  },
];
