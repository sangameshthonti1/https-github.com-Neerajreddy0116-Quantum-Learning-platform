export const stages = ['A different kind of bit', 'Bits and qubits', 'Amplitudes → probabilities', 'Meet the H gate', 'Make a prediction', 'Build it yourself', 'Read your results', 'What if we use H twice?', 'Check your understanding'];
export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correct: number;
  feedback: string[];
}
export const bitCheck: Question = {
  id: 'bit', prompt: 'When we measure a qubit in this lesson, what can we read?',
  options: ['Either 0 or 1', 'Both 0 and 1 in one reading', 'The two amplitudes directly'], correct: 0,
  feedback: ['Exactly. Each reading gives one ordinary bit: 0 or 1. The state tells us the chances of each.', 'A single reading gives just one value. Superposition describes the state before that reading; it is not two classical values displayed at once.', 'We do not read amplitudes in a single measurement. Amplitudes help calculate how likely each outcome is. The simulator can show them because it has the mathematical description.'],
};
export const amplitudeCheck: Question = {
  id: 'amplitude', prompt: 'An amplitude has magnitude 0.5. What is the probability of its outcome?',
  options: ['50%', '25%', '100%'], correct: 1,
  feedback: ['0.5 is the amplitude magnitude. Multiply it by itself first: 0.5 × 0.5 = 0.25, or 25%.', 'Yes. The squared magnitude is 0.5 × 0.5 = 0.25. That means 25%.', 'Probability comes from squaring the magnitude: 0.5 × 0.5 = 0.25. The other outcome accounts for the remaining 75%.'],
};
export const observationCheck: Question = {
  id: 'observation', prompt: 'You saw equal ideal probabilities after H. Must 1,024 shots split exactly in half?',
  options: ['Yes, exactly 512 readings of each value.', 'No. Each shot samples a result, so the counts can differ.'], correct: 1,
  feedback: ['Equal chances describe the state. A finite collection of readings can have an uneven split, just as fair coin tosses can. Revisit the Sampled counts panel and try again.', 'Exactly. The amplitudes determine ideal chances; repeated readings produce counts that can fluctuate. Now you are ready to ask what a second H does.'],
};
export const predictions: Record<'h' | 'hh', Question> = {
  h: { id: 'predict-h', prompt: 'Starting in |0⟩, what ideal probabilities do you predict after one H gate?',
    options: ['100% zero', '50% zero / 50% one', '100% one', 'I’m not sure'], correct: 1,
    feedback: ['Starting in |0⟩ does guarantee zero before the gate. H changes that state: the two new amplitudes have equal magnitude, so neither outcome stays certain.', 'Your prediction follows the amplitude rule: each new amplitude is 1/√2, whose squared magnitude is 1/2.', 'H does not simply turn zero into one. It gives both basis states equal amplitude magnitudes. Squaring them gives equal chances.', 'That is a useful starting point. H gives each basis state amplitude 1/√2. Squaring that magnitude gives 1/2 for each outcome.'],
  },
  hh: { id: 'predict-hh', prompt: 'If H gives a 50/50 result, what happens when we apply H again, before measuring?',
    options: ['100% zero', '50% zero / 50% one', '100% one', 'I’m not sure'], correct: 0,
    feedback: ['Prediction recorded. Add the second H and see whether the simulator agrees.', 'Prediction recorded. This is a natural guess if H seems like a coin toss. Let’s test what happens to the amplitudes.', 'Prediction recorded. Let’s check whether the second H makes one certain.', 'Prediction recorded. Follow the two steps in the Explorer and look for a change in the amplitudes.'],
  },
};
export const quiz: Question[] = [
  { id: 'q-bit', prompt: 'What distinguishes a qubit’s general state from an ordinary bit?', options: ['It contains two readable classical values at once.', 'It is described by amplitudes that can combine in later operations.', 'It is always a hidden classical zero or one.'], correct: 1, feedback: ['A measurement gives one value, not two.', 'Yes. Amplitudes describe more than uncertainty about a hidden bit: later gates can combine them.', 'A hidden bit alone cannot describe the amplitude cancellation you observed with H followed by H.'] },
  { id: 'q-amplitude', prompt: 'An outcome has amplitude 1/√2, approximately 0.7071. What is its probability?', options: ['Approximately 70.71%', 'Approximately 50%', '100%'], correct: 1, feedback: ['That is the amplitude magnitude expressed as a percentage. Square it to find probability.', 'Yes: (1/√2)² = 1/2, or 50%. The superscript 2 means multiply the number by itself.', 'Only magnitude 1 gives probability 100%. Here the squared magnitude is 1/2.'] },
  { id: 'q-h', prompt: 'What does H do to a qubit starting in |0⟩?', options: ['Randomly chooses a classical bit inside the gate.', 'Always changes it to |1⟩.', 'Creates equal positive amplitudes for |0⟩ and |1⟩.'], correct: 2, feedback: ['H changes the state deterministically. Randomness enters when a measurement outcome is sampled.', 'H creates equal amplitudes; it does not make one certain.', 'Exactly. Both amplitudes are 1/√2, giving equal probabilities when measured.'] },
  { id: 'q-hh', prompt: 'Why does H followed by H return |0⟩, with no measurement between the gates?', options: ['Contributions to the one amplitude cancel; contributions to zero add.', 'Two random results always average to zero.', 'The second H measures the first H.'], correct: 0, feedback: ['Yes. This addition and cancellation of amplitude contributions is interference.', 'Averaging random bits would not make every final result zero. The amplitudes combine before any measurement.', 'H is a state-changing gate, not a measurement. Both gates act before the reading.'] },
  { id: 'q-counts', prompt: 'Why might 1,024 runs of the one-H circuit not give exactly 512 zeros?', options: ['The ideal probabilities must be incorrect.', 'Finite samples fluctuate, even with equal ideal probabilities.', 'H changes its rule on every run.'], correct: 1, feedback: ['Equal chances do not force an exact split in a finite sample.', 'Yes. Each shot prepares the same state and samples one result. Larger samples tend to have closer proportions, without guaranteeing an exact split.', 'The gate rule stays the same. Individual sampled outcomes vary.'] },
];
export const scoreQuiz = (answers: Record<string, number>) => quiz.filter((q) => answers[q.id] === q.correct).length;
