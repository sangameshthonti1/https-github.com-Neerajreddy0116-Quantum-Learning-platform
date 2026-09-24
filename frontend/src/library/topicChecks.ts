import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
} from "./topicHelpers";

export const checksTopic: LibraryTopic = {
  slug: "knowledge-checks",
  title: "Beginner quantum knowledge checks",
  category: "Review",
  level: "Beginner",
  updated,
  summary:
    "Expandable questions covering qubits, gates, amplitudes, measurement, samples, phase, and interference. Answers explain the reasoning instead of awarding course progress.",
  terms: [
    {
      term: "Self-check",
      definition:
        "A low-stakes question used to inspect your own understanding.",
    },
    {
      term: "Reasoning",
      definition:
        "The state transformations and evidence supporting an answer.",
    },
  ],
  sections: [
    {
      id: "qubits-and-gates",
      title: "Qubits and gates",
      paragraphs: [
        "Try each question before opening its answer. These reference checks are separate from the deterministically graded lesson quizzes.",
      ],
      checks: [
        {
          question: "Which statement best describes a qubit?",
          options: [
            "A classical bit that can store only 0.",
            "A quantum system described using amplitudes for |0⟩ and |1⟩.",
            "A bit that always returns both 0 and 1 when measured.",
            "Two classical memory cells.",
          ],
          answer:
            "A qubit is a quantum system whose pure state can be written α|0⟩+β|1⟩ with normalized complex amplitudes. One computational-basis measurement returns one classical result.",
        },
        {
          question: "What does X do to a computational-basis state?",
          options: [
            "It exchanges |0⟩ and |1⟩.",
            "It always creates a 50–50 state.",
            "It measures the qubit.",
            "It deletes the qubit.",
          ],
          answer: "X|0⟩=|1⟩ and X|1⟩=|0⟩. It is a reversible basis-state flip.",
        },
        {
          question: "What happens when H is applied to |0⟩?",
          options: [
            "The state becomes |1⟩.",
            "The state stays |0⟩.",
            "The state becomes (|0⟩+|1⟩)/√2.",
            "The qubit is measured.",
          ],
          answer:
            "H|0⟩=|+⟩=(|0⟩+|1⟩)/√2. A later computational-basis measurement has equal ideal probabilities.",
        },
        {
          question: "What happens when H is applied twice to |0⟩?",
          options: [
            "It becomes |1⟩.",
            "It stays |+⟩.",
            "It returns to |0⟩.",
            "The state disappears.",
          ],
          answer:
            "It returns to |0⟩ because H²=I. This identity holds for every single-qubit input state.",
        },
      ],
    },
    {
      id: "amplitudes",
      title: "Amplitudes and probabilities",
      paragraphs: [
        "Use squared magnitudes, not raw amplitudes, for probabilities.",
      ],
      checks: [
        {
          question: "For |ψ⟩=(√3/2)|0⟩+(1/2)|1⟩, what are P(0) and P(1)?",
          options: [
            "3/4 and 1/4",
            "√3/2 and 1/2",
            "1/2 and 1/2",
            "3/2 and 1/2",
          ],
          answer: "P(0)=|√3/2|²=3/4 and P(1)=|1/2|²=1/4. They sum to one.",
        },
        {
          question:
            "If the real amplitude for |1⟩ is −0.6, what is its probability?",
          answer:
            "|−0.6|²=0.36, so the probability is 36%. The minus sign can matter to later interference even though it does not make the probability negative.",
        },
        {
          question:
            "What is the difference between an amplitude and a probability?",
          options: [
            "They are identical.",
            "Amplitudes describe the state; squared magnitudes give probabilities.",
            "Probabilities can be negative.",
            "Amplitudes must be non-negative real numbers.",
          ],
          answer:
            "Amplitudes are generally complex and carry magnitude and phase. Measurement probability is the real non-negative squared magnitude.",
        },
        {
          question:
            "True or false: multiplying the entire statevector by −1 changes every later measurement.",
          answer:
            "False. A common factor −1 is global phase. It represents the same physical pure state and remains globally equivalent under the same later unitary operations.",
        },
      ],
    },
    {
      id: "measurement-and-sampling",
      title: "Measurement and sampling",
      paragraphs: [
        "Keep one-shot outcomes separate from long-run distributions.",
      ],
      checks: [
        {
          question:
            "What can one computational-basis measurement of a qubit return?",
          options: ["Only 0", "Only 1", "0 or 1", "Any decimal number"],
          answer:
            "It returns one classical bit, 0 or 1, with probabilities set by the state and measurement basis.",
        },
        {
          question: "A |+⟩ state is measured once. What can happen?",
          options: [
            "Only 0",
            "Only 1",
            "Either 0 or 1",
            "Both values in the same result",
          ],
          answer:
            "Either 0 or 1 is recorded. Each has probability one half in an ideal computational-basis measurement.",
        },
        {
          question:
            "An H circuit produces 47 zeros and 53 ones in 100 shots. Is this compatible with a 50–50 ideal distribution?",
          answer:
            "Yes. Finite samples fluctuate. Counts need not be exactly equal, and larger samples generally provide a more stable estimate.",
        },
        {
          question:
            "If P(0)=75% and P(1)=25%, what is a reasonable expectation for 1,000 shots?",
          options: [
            "About 500 and 500",
            "About 750 zeros and 250 ones",
            "About 250 zeros and 750 ones",
            "Only zeros",
          ],
          answer:
            "About 750 zeros and 250 ones, with ordinary finite-sample variation. Each shot must repeat preparation, gates, and measurement.",
        },
      ],
    },
    {
      id: "phase-and-interference",
      title: "Phase and interference",
      paragraphs: [
        "These questions connect invisible amplitude information to visible outcomes.",
      ],
      checks: [
        {
          question: "What does Z do to |+⟩=(|0⟩+|1⟩)/√2?",
          answer:
            "It changes the relative sign: Z|+⟩=(|0⟩−|1⟩)/√2=|−⟩. Immediate computational-basis probabilities remain 50–50.",
        },
        {
          question: "Why does H→Z→H produce guaranteed 1 from |0⟩?",
          answer:
            "Z changes relative phase. The final H recombines amplitudes so contributions to |0⟩ cancel and contributions to |1⟩ reinforce.",
        },
        {
          question: "What single gate is HZH equivalent to?",
          answer:
            "HZH=X. Hadamard changes basis, Z performs a phase flip, and Hadamard changes back, yielding a bit flip.",
        },
        {
          question: "Why can two H gates undo each other?",
          options: [
            "H is a measurement.",
            "The second H recombines signed amplitudes and H²=I.",
            "All gates automatically cancel.",
            "A measurement occurs after each gate.",
          ],
          answer:
            "The second H transforms the amplitudes created by the first. Contributions interfere, and the operator identity H²=I restores the whole state.",
        },
        {
          question: "Do opposite signs always make an output probability zero?",
          answer:
            "No. Complete cancellation requires equal-magnitude contributions with phase difference π. Unequal magnitudes or other phases cause partial interference.",
        },
      ],
    },
    {
      id: "reasoning-challenge",
      title: "Reasoning challenge",
      paragraphs: [
        "Predict the circuit |0⟩→H→H→X→measurement before opening the answer.",
      ],
      checks: [
        {
          question: "What is the ideal final result of |0⟩→H→H→X→measurement?",
          options: ["Always 0", "Always 1", "50–50"],
          answer:
            "Always 1. Since H²=I, the two H gates cancel as operators. The remaining X maps |0⟩ to |1⟩.",
        },
        {
          question:
            "What should a complete explanation of the HZH experiment mention?",
          answer:
            "Name Z’s relative phase flip, the final H’s recombination, destructive interference for |0⟩, constructive interference for |1⟩, and the resulting certainty of measuring 1.",
        },
      ],
    },
  ],
  sources: [
    suppliedNotes("Beginner knowledge checks; Explain and Check Understanding"),
  ],
  downloads: [
    download("Chances and understanding · Parts 07–08", "beginner-part-04.pdf"),
    download("Beginner review · Part 17", "beginner-part-09.pdf"),
    download(
      "Phase explanation and checks",
      "explain-and-check-understanding-notes.pdf",
    ),
  ],
  relatedSlugs: [
    "hzh-phase-to-bit-flip",
    "sampling-shots-and-counts",
    "qubits-and-superposition",
  ],
};
