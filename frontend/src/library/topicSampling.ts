import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const samplingTopic: LibraryTopic = {
  slug: "sampling-shots-and-counts",
  title: "Sampling, shots, counts, and frequencies",
  category: "Experiments",
  level: "Beginner",
  updated,
  summary:
    "How repeated circuit executions turn theoretical probabilities into observed counts, why finite samples fluctuate, and what more shots can—and cannot—tell you.",
  terms: [
    {
      term: "Shot",
      definition: "One complete prepare–run–measure execution of a circuit.",
    },
    {
      term: "Count",
      definition: "How many shots produced a particular outcome.",
    },
    {
      term: "Frequency",
      definition: "An outcome count divided by the total number of shots.",
    },
    {
      term: "Sampling",
      definition:
        "Drawing outcomes from the probability distribution defined by a measurement.",
    },
  ],
  sections: [
    {
      id: "probability-count-frequency",
      title: "Probability, count, and frequency are different",
      paragraphs: [
        "A probability is the ideal theoretical chance of an outcome. A count records how often the outcome actually appeared. An observed frequency is count divided by total shots.",
        "For a 50–50 state, ten shots may produce four zeros and six ones. The 40% and 60% frequencies do not replace the theoretical probabilities and do not show that the state changed.",
      ],
      equation: {
        notation: "observed frequency of 0 = n₀/N     n₀+n₁=N",
        explanation:
          "Use a frequency symbol such as f₀ or p̂(0), not P(0), to keep observations separate from theory.",
      },
    },
    {
      id: "shots",
      title: "Every shot repeats the experiment",
      paragraphs: [
        "One shot prepares or resets the qubits, applies the gate sequence, and measures once. A thousand shots repeat that complete process a thousand times.",
        "A projective measurement generally changes the state. Measuring the same already-collapsed qubit repeatedly is not equivalent to preparing the original state for every shot.",
      ],
    },
    {
      id: "examples",
      title: "Worked sampling examples",
      paragraphs: [
        "For H|0⟩, the ideal probabilities are 50% and 50%. Ten shots might produce 4 and 6 counts; 100 shots might produce 48 and 52; 1,000 shots might produce 497 and 503. Every set is plausible.",
        "For P(0)=75% and P(1)=25%, about 75 zeros and 25 ones are expected in 100 shots, but 73/27 or 77/23 is also reasonable.",
      ],
      bullets: [
        "10 shots: fluctuations can look large.",
        "100 shots: frequencies are often visibly closer to theory.",
        "1,000 shots: typical statistical uncertainty is smaller.",
        "10,000 shots: frequencies are usually more stable, though never forced to be exact.",
      ],
    },
    {
      id: "law-of-large-numbers",
      title: "What more shots improve",
      paragraphs: [
        "Under repeated independent preparation, observed frequencies converge toward the underlying probabilities in the law-of-large-numbers sense. The approach is not monotonic: adding a shot can temporarily move the displayed percentage farther from the theoretical value.",
        "For a binary outcome with probability p, the standard deviation of the observed frequency is approximately √(p(1−p)/N). Statistical uncertainty therefore shrinks like 1/√N.",
      ],
      equation: {
        notation: "σ(p̂) = √(p(1−p)/N)",
        explanation: "At p=1/2, the standard deviation is 1/(2√N).",
      },
    },
    {
      id: "ideal-versus-hardware",
      title: "Sampling error is not hardware error",
      paragraphs: [
        "Finite-shot fluctuations occur even in an ideal simulator. Real hardware adds state-preparation, gate, decoherence, and readout errors that may create systematic differences which do not disappear merely by increasing shots.",
        "The platform reports exact ideal probabilities separately from sampled counts. Compare counts with the exact distribution before attributing a difference to physics or software.",
      ],
    },
    {
      id: "scientist-workflow",
      title: "Read results like a scientist",
      paragraphs: [
        "State the theoretical probabilities, inspect the number of shots, convert counts to frequencies, estimate whether the deviation is plausible, and preserve the circuit and settings that generated the evidence.",
        "Do not demand exactly 50 zeros and 50 ones from 100 shots. Also do not treat a roughly balanced sample as proof of a specific state: many different quantum states and classical mixtures can share the same measurement distribution.",
      ],
    },
  ],
  sources: [
    suppliedNotes("Chances and Actual Counts; Read Your Results"),
    textbook,
  ],
  downloads: [
    download("Chances and counts · Parts 07–08", "beginner-part-04.pdf"),
    download("Results and H twice · Parts 15–16", "beginner-part-08.pdf"),
  ],
  relatedSlugs: [
    "predict-build-and-read-circuits",
    "quantum-measurement",
    "amplitudes-and-the-born-rule",
  ],
};
