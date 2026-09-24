import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const hzhTopic: LibraryTopic = {
  slug: "hzh-phase-to-bit-flip",
  title: "Turning phase into a bit flip: HZH = X",
  category: "Phase & interference",
  level: "Beginner",
  updated,
  summary:
    "Follow H→Z→H gate by gate, see a hidden phase change become a certain measurement result, and explain the interference path by path.",
  terms: [
    {
      term: "Basis change",
      definition:
        "A transformation that expresses or acts on a state relative to another basis.",
    },
    {
      term: "Phase flip",
      definition:
        "The Z operation, which changes the sign of the |1⟩ component.",
    },
    {
      term: "Conjugation",
      definition:
        "Transforming an operation as UAU†; here HZH converts Z into X.",
    },
  ],
  sections: [
    {
      id: "three-steps",
      title: "Three gate applications",
      paragraphs: [
        "Start from |0⟩. The first H creates |+⟩. Z changes |+⟩ to |−⟩ by flipping the |1⟩ amplitude sign. The final H maps |−⟩ to |1⟩.",
        "The intermediate computational-basis probabilities after Z are still 50–50, but the final answer is completely different from H→H.",
      ],
      equation: {
        notation: "|0⟩ →H (|0⟩+|1⟩)/√2 →Z (|0⟩−|1⟩)/√2 →H |1⟩",
        explanation: "The ideal final probability is P(1)=1.",
      },
    },
    {
      id: "full-calculation",
      title: "The final H calculation",
      paragraphs: [
        "Apply H to each component of |−⟩ and preserve the minus sign in front of H|1⟩. The |0⟩ terms then cancel while the |1⟩ terms add.",
      ],
      equation: {
        notation: "H[(|0⟩−|1⟩)/√2] = 1/2[(|0⟩+|1⟩)−(|0⟩−|1⟩)] = |1⟩",
        explanation: "Relative phase selects which output reinforces.",
      },
    },
    {
      id: "path-table",
      title: "Follow each contribution",
      paragraphs: [
        "Immediately before the last H, the |0⟩ branch has weight +1/√2 and the |1⟩ branch has weight −1/√2. Each branch contributes to both final outputs.",
        "For output |0⟩, the contributions +1/2 and −1/2 cancel. For output |1⟩, the contributions +1/2 and +1/2 reinforce.",
      ],
      bullets: [
        "Incoming |0⟩ component → +1/2 to |0⟩ and +1/2 to |1⟩.",
        "Incoming −|1⟩ component → −1/2 to |0⟩ and +1/2 to |1⟩.",
        "Total amplitude A₀=0; total amplitude A₁=1.",
      ],
    },
    {
      id: "z-qualification",
      title: "What Z did—and did not do",
      paragraphs: [
        "Z did not change the probabilities of an immediate computational-basis measurement at the middle of this circuit. It did change relative phase.",
        "Z can be detected directly in another basis: |+⟩ and |−⟩ are distinct X-basis states. Saying “Z never changes measurement” without naming the basis would therefore be incorrect.",
      ],
    },
    {
      id: "identity",
      title: "The operator identity HZH=X",
      paragraphs: [
        "Multiplying the matrices shows that HZH equals Pauli-X. Hadamard changes basis, Z performs a phase flip in that basis, and the final Hadamard changes back.",
        "This is a compact example of conjugation: a phase operation viewed through the H basis becomes a computational-basis bit flip.",
      ],
      equation: {
        notation: "HZH = X",
        explanation:
          "The equality holds as an operator, so it applies to every single-qubit input state.",
      },
    },
    {
      id: "complete-explanation",
      title: "How to explain the observation",
      paragraphs: [
        "A complete explanation should name the invisible middle step, the recombining final step, and the visible result in order.",
        "Z flips the relative sign of the |1⟩ amplitude without changing middle-step Z-basis probabilities. The last H recombines both components. Contributions to |0⟩ cancel and contributions to |1⟩ reinforce, so the final measurement gives 1 with certainty.",
      ],
      note: {
        title: "Common mistake",
        text: "“Z did not change the probability, so nothing should change” stops reasoning too early. Final probabilities must be computed after the final H.",
      },
    },
  ],
  sources: [
    suppliedNotes(
      "Build HZH and Interference; Explain and Check Understanding",
    ),
    textbook,
  ],
  downloads: [
    download(
      "Build HZH and interference notes",
      "build-hzh-and-interference-notes.pdf",
    ),
    download(
      "Phase and interference beginner notes",
      "phase-and-interference-beginner-notes.pdf",
    ),
    download(
      "Explanation and understanding checks",
      "explain-and-check-understanding-notes.pdf",
    ),
  ],
  relatedSlugs: [
    "phase-in-quantum-states",
    "interference-and-h-twice",
    "knowledge-checks",
  ],
};
