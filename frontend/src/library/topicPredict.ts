import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
} from "./topicHelpers";

export const predictTopic: LibraryTopic = {
  slug: "predict-build-and-read-circuits",
  title: "Predict, build, run, and read a circuit",
  category: "Experiments",
  level: "Beginner",
  updated,
  summary:
    "A practical workflow for treating simple circuits as experiments: predict first, construct independently, run many shots, and compare evidence with theory.",
  terms: [
    {
      term: "Prediction",
      definition:
        "Expected outcomes or probabilities stated before running an experiment.",
    },
    {
      term: "Experiment",
      definition: "A repeatable prepare–transform–measure procedure.",
    },
    {
      term: "Evidence",
      definition: "Observed results compared with a prediction.",
    },
  ],
  sections: [
    {
      id: "predict-first",
      title: "Predict before measuring",
      paragraphs: [
        "Inspect the initial state and gates before pressing Run. Work out the final state or expected probabilities, record the prediction, and only then use the experiment as a test of your reasoning.",
        "A quantum prediction usually describes a distribution rather than the exact result of one shot.",
      ],
      bullets: [
        "Look at the starting state and ordered gates.",
        "Predict the final state and probabilities.",
        "Build the circuit independently.",
        "Run the circuit for many shots.",
        "Compare counts with the prediction and explain differences.",
      ],
    },
    {
      id: "four-baselines",
      title: "Four useful baseline circuits",
      paragraphs: [
        "The beginner notes develop four one-qubit examples. They establish a compact vocabulary for later experiments.",
      ],
      bullets: [
        "|0⟩ → measurement: always 0.",
        "|0⟩ → X → measurement: always 1.",
        "|0⟩ → H → measurement: 0 and 1 with equal ideal probabilities.",
        "|0⟩ → H → H → measurement: returns to 0 because H²=I.",
      ],
    },
    {
      id: "build-challenges",
      title: "Build it yourself",
      paragraphs: [
        "Use only X, H, and measurement to design a circuit that always gives 0, always gives 1, gives equal chances, or uses at least two gates. Constructing from empty wires checks understanding more strongly than loading a finished template.",
        "One valid set is: empty circuit for 0, X for 1, H for 50–50, and H followed by H for a two-gate return to 0. Other gate sequences may be equivalent and should be evaluated by their actual state transformation.",
      ],
    },
    {
      id: "one-shot-versus-many",
      title: "Read one result differently from many results",
      paragraphs: [
        "One measurement gives one classical answer. Many independently prepared shots produce counts that estimate the distribution. A 50–50 circuit might return 47 zeros and 53 ones in 100 shots without contradicting the prediction.",
        "Each shot must prepare or reset the qubit, apply the same gates, and measure again. Repeatedly reading one already measured qubit would not sample the original superposition.",
      ],
    },
    {
      id: "experiment-loop",
      title: "The experiment loop",
      paragraphs: [
        "Learning happens by moving repeatedly through build, predict, run, compare, and understand. If results disagree, check the initial state, gate order, control and target wires, measurement basis, number of shots, and whether the displayed result belongs to the current circuit.",
      ],
      equation: {
        notation: "Build → Predict → Run → Compare → Understand",
        explanation:
          "A result is evidence only when it comes from the circuit and settings you intended to test.",
      },
    },
    {
      id: "pseudocode",
      title: "Circuit meaning before programming syntax",
      paragraphs: [
        "A library might express the H experiment as “prepare |0⟩; apply H; measure.” The exact programming syntax is secondary to understanding the state transformation.",
        "The same semantic circuit should produce the same ideal probabilities across correct simulators, even if APIs or code formats differ.",
      ],
    },
  ],
  sources: [suppliedNotes("From Prediction to Experiment; Read Your Results")],
  downloads: [
    download("Prediction and building · Parts 13–14", "beginner-part-07.pdf"),
    download("Results and H twice · Parts 15–16", "beginner-part-08.pdf"),
  ],
  relatedSlugs: [
    "sampling-shots-and-counts",
    "quantum-circuits-and-x-gate",
    "hadamard-gate",
  ],
};
