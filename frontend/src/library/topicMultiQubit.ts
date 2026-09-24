import type { LibraryTopic } from "./types";
import {
  download,
  libraryUpdated as updated,
  suppliedNotes,
  textbook,
} from "./topicHelpers";

export const multiQubitTopic: LibraryTopic = {
  slug: "multi-qubit-state-spaces",
  title: "Multi-qubit state spaces",
  category: "Multi-qubit",
  level: "Intermediate",
  updated,
  summary:
    "How basis states scale from one qubit to many, what a general two-qubit state looks like, and why superposition is not readable parallel classical storage.",
  terms: [
    {
      term: "Tensor-product basis",
      definition:
        "The joint basis formed from basis states of component systems.",
    },
    {
      term: "Basis state",
      definition: "One vector in the chosen basis, such as |01⟩.",
    },
    {
      term: "Entanglement",
      definition:
        "A joint state that cannot be factored into independent states of its parts.",
    },
    {
      term: "State-space dimension",
      definition:
        "The number of basis amplitudes needed to describe a state in a basis.",
    },
  ],
  sections: [
    {
      id: "two-bits",
      title: "Two classical bits",
      paragraphs: [
        "Two classical bits have four possible strings: 00, 01, 10, and 11. At one moment, an ideal classical register stores one definite string, even if an observer does not know which.",
      ],
    },
    {
      id: "two-qubits",
      title: "Two qubits",
      paragraphs: [
        "Two qubits have four computational-basis states with the same labels written as kets. A general pure state assigns a complex amplitude to each basis state.",
        "The squared magnitudes of all four amplitudes must sum to one.",
      ],
      equation: {
        notation: "|ψ⟩=α|00⟩+β|01⟩+γ|10⟩+δ|11⟩     |α|²+|β|²+|γ|²+|δ|²=1",
        explanation:
          "A computational-basis measurement returns one of the four bit strings.",
      },
    },
    {
      id: "scaling",
      title: "The state space grows exponentially",
      paragraphs: [
        "An n-qubit pure state has 2ⁿ computational-basis amplitudes. This exponential description is a mathematical resource and a simulation challenge.",
      ],
      bullets: [
        "1 qubit → 2 basis states",
        "2 qubits → 4",
        "3 qubits → 8",
        "4 qubits → 16",
        "5 qubits → 32",
        "10 qubits → 1,024",
      ],
    },
    {
      id: "not-readable-storage",
      title: "Not 2ⁿ readable answers at once",
      paragraphs: [
        "A ten-qubit state may contain amplitudes for 1,024 basis states, but one standard measurement returns one ten-bit string. Quantum computing does not work by simply storing many classical answers and reading them all.",
        "Algorithms arrange interference so unwanted outcome amplitudes shrink and useful outcome amplitudes grow before measurement.",
      ],
    },
    {
      id: "product-entangled",
      title: "Product states and entangled states",
      paragraphs: [
        "Some joint states factor into an independent state for each qubit. Entangled states do not. For example, the Bell state (|00⟩+|11⟩)/√2 is a pure joint state that cannot be written as one state for qubit 0 times one state for qubit 1.",
        "Each reduced qubit of that Bell state is maximally mixed even though the joint state is pure. Centered individual Bloch vectors therefore do not mean the qubits are missing.",
      ],
    },
    {
      id: "correlation",
      title: "Correlation requires careful language",
      paragraphs: [
        "Classical systems can also be correlated. The distinctive quantum claims concern correlations and measurement statistics that cannot always be reproduced by local hidden-variable models.",
        "Correlation alone is not enough to prove entanglement, and entanglement does not permit controlled faster-than-light messaging.",
      ],
    },
    {
      id: "algorithmic-resources",
      title: "How multi-qubit resources work together",
      paragraphs: [
        "Quantum algorithms can use superposition, interference, and entanglement together. Any claim of speedup must specify the problem, computational model, assumptions, and comparison with classical methods.",
        "The platform currently limits circuits to three qubits so every basis state and intermediate reduced state remains inspectable.",
      ],
    },
  ],
  sources: [
    suppliedNotes("Bits and Qubits; Multi-qubit state-space introduction"),
    textbook,
  ],
  downloads: [
    download(
      "Bits, qubits, and multi-qubit states · Parts 09–10",
      "beginner-part-05.pdf",
    ),
  ],
  relatedSlugs: [
    "qubits-and-superposition",
    "interference-and-h-twice",
    "classical-information-and-bits",
  ],
};
