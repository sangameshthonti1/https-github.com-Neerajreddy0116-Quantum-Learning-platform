import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const interferenceTopic: LibraryTopic = {
  slug: "interference-and-h-twice",
  title: "Quantum interference and applying H twice",
  category: "Phase & interference",
  level: "Beginner",
  updated,
  summary:
    "A complete derivation of H²=I, constructive and destructive interference, and why amplitudes—not ordinary probabilities—cancel or reinforce.",
  terms: [
    {
      term: "Interference",
      definition:
        "The addition of complex amplitude contributions to a common output.",
    },
    {
      term: "Constructive interference",
      definition:
        "Contributions reinforce, increasing the output amplitude magnitude.",
    },
    {
      term: "Destructive interference",
      definition: "Contributions cancel partially or completely.",
    },
    {
      term: "Self-inverse",
      definition: "An operation whose square is identity.",
    },
  ],
  sections: [
    {
      id: "experiment",
      title: "One H and two H gates are different experiments",
      paragraphs: [
        "Starting from |0⟩, one H produces |+⟩ and therefore 50–50 computational-basis probabilities. Inserting a second H before measurement returns the state to |0⟩.",
        "The second H does not add more randomness. It transforms the signed amplitudes created by the first H.",
      ],
      equation: {
        notation: "|0⟩ → H → |+⟩ → H → |0⟩",
        explanation:
          "The two-gate circuit produces 0 with certainty in the ideal model.",
      },
    },
    {
      id: "derivation",
      title: "Step-by-step derivation",
      paragraphs: [
        "Apply H linearly to both components of |+⟩. Use H|0⟩=(|0⟩+|1⟩)/√2 and H|1⟩=(|0⟩−|1⟩)/√2.",
        "After substitution, the two |0⟩ contributions add while the two |1⟩ contributions cancel.",
      ],
      equation: {
        notation: "H[(|0⟩+|1⟩)/√2] = 1/2[(|0⟩+|1⟩)+(|0⟩−|1⟩)] = |0⟩",
        explanation:
          "The result follows from adding amplitudes before taking squared magnitudes.",
      },
    },
    {
      id: "contributions",
      title: "Contributions to each output",
      paragraphs: [
        "The intermediate |0⟩ component contributes +1/2 to both outputs under the final H. The intermediate |1⟩ component contributes +1/2 to output |0⟩ and −1/2 to output |1⟩.",
        "For output |0⟩ the contributions total 1. For output |1⟩ they total 0. Squaring those final amplitudes gives probabilities 1 and 0.",
      ],
      bullets: [
        "Output |0⟩: +1/2 + +1/2 = 1 → constructive interference.",
        "Output |1⟩: +1/2 + −1/2 = 0 → complete destructive interference.",
      ],
    },
    {
      id: "not-probability-cancellation",
      title: "Probabilities do not directly cancel",
      paragraphs: [
        "Ordinary probabilities are non-negative and do not carry a relative minus sign. Quantum gates first add complex amplitudes associated with different intermediate basis components; only afterward does the Born rule convert the total amplitude into probability.",
        "The familiar same-sign/opposite-sign rule is exact for these equal real contributions. In general, unequal magnitudes or other phase differences produce partial interference.",
      ],
      equation: {
        notation: "|a+b|² = |a|² + |b|² + 2 Re(a* b)",
        explanation: "The cross term contains the relative-phase dependence.",
      },
    },
    {
      id: "operator-identity",
      title: "H²=I is an operator identity",
      paragraphs: [
        "Hadamard is its own inverse for every single-qubit state, not only |0⟩. Starting from |1⟩, two H gates return |1⟩. Starting from any α|0⟩+β|1⟩, they restore the complete statevector.",
      ],
      equation: {
        notation: "H²=I     H(H|ψ⟩)=|ψ⟩",
        explanation:
          "This is exact ideal-state recovery, not merely equal final probability bars.",
      },
    },
    {
      id: "prediction-challenge",
      title: "Prediction challenge: H → H → X",
      paragraphs: [
        "Because the adjacent H gates compose to identity, |0⟩→H→H→X is equivalent to |0⟩→X. The final state is |1⟩ and an ideal computational-basis measurement always returns 1.",
        "Circuit identities can simplify reasoning, but the intermediate states still matter when learning how interference works.",
      ],
    },
    {
      id: "paths-language",
      title: "Use “paths” carefully",
      paragraphs: [
        "It is useful to decompose an output amplitude into contributions associated with intermediate basis states. These are mathematical branches of a linear calculation, not necessarily literal hidden trajectories followed by the qubit.",
      ],
    },
  ],
  sources: [
    suppliedNotes("Global & Relative Phase; Read Your Results & Use H Twice"),
    textbook,
  ],
  downloads: [
    download(
      "Global and relative phase · H→H",
      "global-relative-phase-h-h.pdf",
    ),
    download("Results and H twice · Parts 15–16", "beginner-part-08.pdf"),
  ],
  relatedSlugs: [
    "phase-in-quantum-states",
    "hzh-phase-to-bit-flip",
    "hadamard-gate",
  ],
};
