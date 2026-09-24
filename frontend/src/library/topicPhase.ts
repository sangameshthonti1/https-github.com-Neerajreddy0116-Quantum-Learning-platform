import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const phaseTopic: LibraryTopic = {
  slug: "phase-in-quantum-states",
  title: "Global phase, relative phase, and the Z gate",
  category: "Phase & interference",
  level: "Beginner",
  updated,
  summary:
    "Phase as the angle of a complex amplitude, why global phase is physically irrelevant for an isolated state, why relative phase matters, and how Z changes it.",
  terms: [
    {
      term: "Phase",
      definition: "The angular part θ of a complex amplitude written as reⁱᶿ.",
    },
    {
      term: "Global phase",
      definition:
        "A common unit-magnitude factor multiplying the complete statevector.",
    },
    {
      term: "Relative phase",
      definition: "A phase difference between statevector components.",
    },
    { term: "Pauli-Z", definition: "The phase-flip gate diag(1,−1)." },
  ],
  sections: [
    {
      id: "complex-amplitude",
      title: "Phase is part of a complex amplitude",
      paragraphs: [
        "A complex number can be written with a magnitude r and angle θ. The magnitude contributes to measurement probability; the angle contributes phase information.",
        "The real amplitudes +1 and −1 have equal magnitude but phases separated by π radians. Their squared magnitudes are both one.",
      ],
      equation: {
        notation: "z = r eⁱᶿ     probability contribution = |z|² = r²",
        explanation: "Immediate probabilities can hide phase differences.",
      },
    },
    {
      id: "same-probabilities",
      title: "Same probabilities, different states",
      paragraphs: [
        "The normalized states |+⟩ and |−⟩ both produce 50–50 outcomes in the computational basis. They are nevertheless different states because their |1⟩ amplitudes have different phase relative to their |0⟩ amplitudes.",
        "They are perfectly distinguishable in the X basis: applying H maps |+⟩ to |0⟩ and |−⟩ to |1⟩. The statement “they are indistinguishable” is therefore true only for a direct computational-basis measurement.",
      ],
      equation: {
        notation: "|+⟩=(|0⟩+|1⟩)/√2     |−⟩=(|0⟩−|1⟩)/√2",
        explanation:
          "The normalization factors are required; omitting them would not describe normalized states.",
      },
    },
    {
      id: "global-phase",
      title: "Global phase",
      paragraphs: [
        "Multiplying every amplitude by the same phase factor eⁱᶠ does not change the physical pure state. All outcome probabilities are unchanged, and applying the same later unitary to both representatives preserves their equivalence.",
        "For example, −(|0⟩+|1⟩)/√2 differs from |+⟩ only by a global factor −1.",
      ],
      equation: {
        notation: "|ψ⟩ ∼ eⁱᶠ|ψ⟩",
        explanation:
          "Statevectors related by a global phase represent the same pure physical state.",
      },
      note: {
        title: "Important boundary",
        text: "A phase applied to only one coherent branch of a larger state is not global with respect to the full state; it can become observable as relative phase.",
      },
    },
    {
      id: "relative-phase",
      title: "Relative phase",
      paragraphs: [
        "Relative phase compares components of the same state. Changing one component from +1/√2 to −1/√2 introduces a phase difference π relative to the other component.",
        "Later gates can bring those components into the same output amplitude. Their complex contributions then add, partially cancel, or reinforce according to magnitude and phase.",
      ],
    },
    {
      id: "z-gate",
      title: "The Pauli-Z gate",
      paragraphs: [
        "Z leaves the |0⟩ component unchanged and multiplies the |1⟩ component by −1. On a general superposition it can change relative phase without changing immediate computational-basis probabilities.",
        "On the Bloch sphere, Z is a π rotation around the z-axis. On the isolated basis state |1⟩, the minus sign is only global; it becomes relative when another nonzero component is present.",
      ],
      equation: {
        notation: "Z=[[1,0],[0,−1]]     Z|0⟩=|0⟩     Z|1⟩=−|1⟩     Z|+⟩=|−⟩",
        explanation:
          "Z preserves Z-basis probabilities but can change X-basis outcomes.",
      },
    },
    {
      id: "comparison",
      title: "Global and relative phase compared",
      paragraphs: [
        "Global phase multiplies the whole state and is unobservable by itself. Relative phase changes one component with respect to another and can affect interference after a suitable recombining operation.",
        "Relative phase is not the only ingredient in interference: amplitude magnitudes, the later gate, and measurement basis also determine the final probabilities.",
      ],
    },
  ],
  sources: [
    suppliedNotes("Phase & Interference; Global & Relative Phase"),
    textbook,
  ],
  downloads: [
    download(
      "Phase and interference beginner notes",
      "phase-and-interference-beginner-notes.pdf",
    ),
    download(
      "Global and relative phase · H→H",
      "global-relative-phase-h-h.pdf",
    ),
  ],
  relatedSlugs: [
    "interference-and-h-twice",
    "hzh-phase-to-bit-flip",
    "hadamard-gate",
  ],
};
