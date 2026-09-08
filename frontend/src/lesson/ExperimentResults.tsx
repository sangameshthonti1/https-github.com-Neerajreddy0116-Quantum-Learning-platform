import { useState } from 'react';
import { ProbabilityBars, StatevectorTable, formatNumber } from '../lab/QuantumStateViews';
import BlochSphere from '../lab/BlochSphere';
import type { Evidence, Experiment } from './lessonState';
import { predictions } from './content';

export default function ExperimentResults({ evidence, experiment }: { evidence: Evidence; experiment: Experiment }) {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState(0);
  const panels = ['Probabilities', 'Amplitudes', 'State map', 'Sampled counts'];
  const step = evidence.trace.steps[index]!;
  const { simulation, request } = evidence;
  const matched = Math.abs(simulation.probabilities['0']! - (evidence.prediction === 0 ? 1 : evidence.prediction === 1 ? 0.5 : 0)) < 1e-10 && evidence.prediction !== 3;
  return <section className="lesson-observation" aria-label="Your real experiment results">
    <p className="lesson-source">Collected from your executed {request.gates.length === 1 ? 'one-H' : 'two-H'} circuit · {request.shots.toLocaleString('en-US')} runs</p>
    <div className="lesson-callout" data-testid={`comparison-${experiment}`}><p>Your prediction: <strong>{predictions[experiment].options[evidence.prediction]}</strong>.</p>
      <p>The simulator returned <strong>{formatNumber(simulation.probabilities['0']! * 100)}% zero</strong> and <strong>{formatNumber(simulation.probabilities['1']! * 100)}% one</strong>.</p>
      <p>{evidence.prediction === 3 ? 'You now have an observation to build your explanation around.' : matched ? 'Your prediction agrees with the ideal probabilities.' : 'This differs from your prediction. Follow the amplitudes below to see why.'}</p></div>
    <p>Read your experiment one panel at a time. The first three panels follow the selected snapshot; sampled counts always describe the whole circuit’s final readings.</p>
    <div className="lesson-result-panels" aria-label="Read the result panels">{panels.map((name, i) => <button key={name} aria-pressed={panel === i} onClick={() => setPanel(i)}>{i + 1}. {name}</button>)}</div>
    <div hidden={panel === 3}><p>A <strong>trace</strong> is a sequence of calculated snapshots: the starting state and the state after each gate. Choose a snapshot below. These values came from your actual circuit.</p>
    <div className="lesson-step-buttons" aria-label="Collected experiment steps">{evidence.trace.steps.map((s) => <button key={s.index} aria-pressed={s.index === index} onClick={() => setIndex(s.index)}>{s.index === 0 ? 'Initial state' : `After H${s.index === 2 ? ' twice' : ''}`}</button>)}</div>
    <p role="status">{index === 0 ? 'Initial state: before any gate.' : `State after ${index} H ${index === 1 ? 'gate' : 'gates'}; before measurement.`}</p></div>
    <section hidden={panel !== 0} aria-label="Read probabilities"><h3>1. Follow the state before reading it</h3>
    <ProbabilityBars probabilities={step.probabilities} prefix={`lesson-${experiment}`} />
    <p>Each bar is the chance of the outcome beside it. The decimal 1 means 100%; 0.5 means 50%. Here the chance of zero is {formatNumber(step.probabilities['0']! * 100)}%.</p></section>
    <section hidden={panel !== 1} aria-label="Read amplitudes">
    <h3>2. Read the amplitudes</h3><p>A <strong>statevector</strong> is the ordered list of amplitudes. “Basis” identifies which state each row belongs to. “Real” and “Imaginary” are the two numerical parts of an amplitude. In this experiment the imaginary parts are zero, so squaring the real part gives the probability.</p>
    <StatevectorTable statevector={step.statevector} basis={evidence.trace.basisOrder} label="Lesson amplitudes" />
    <p>The amplitude for |0⟩ is {formatNumber(step.statevector[0]!.real)} in its real part; for |1⟩ it is {formatNumber(step.statevector[1]!.real)}. Small rounding differences in the display do not change the explanation.</p></section>
    <section hidden={panel !== 2} aria-label="Read the state map">
    <h3>3. See the same state on a sphere</h3><p>The <strong>Bloch sphere</strong> is a map of one qubit’s state, not its physical location. The top, marked +Z, represents |0⟩. The direction marked +X represents the equal positive amplitudes after one H. X here names a direction; it does not mean you added an X gate.</p>
    <div className="lesson-sphere"><BlochSphere step={step} beginner /></div></section>
    <section hidden={panel !== 3} aria-label="Read sampled counts">
    <h3>4. Compare chances with actual readings</h3><p>An <strong>ideal probability</strong> is calculated from the state in this noise-free model. A <strong>sampled count</strong> is how many times an outcome actually appeared in the simulator’s repeated readings.</p>
    <div className="lesson-comparison" data-testid={`lesson-counts-${experiment}`}><section><h3>Zero readings</h3><p className="lesson-big-symbol">{simulation.counts['0']!.toLocaleString('en-US')}</p></section><section><h3>One readings</h3><p className="lesson-big-symbol">{simulation.counts['1']!.toLocaleString('en-US')}</p></section></div>
    <p>These counts total {simulation.shots.toLocaleString('en-US')} <strong>shots</strong>. Each shot starts again in |0⟩, applies the whole circuit, then reads once. It is not repeatedly reading the same unprepared qubit.</p>
    <p>Equal chances do not require exactly half of a finite sample to be zero. Like repeated fair coin tosses, proportions fluctuate. The analogy applies to the final readings only: the gate itself is not a coin toss. Larger samples tend to approach the ideal proportions, without guaranteeing an exact split.</p></section>
    <div className="lesson-panel-navigation"><button disabled={panel === 0} onClick={() => setPanel(panel - 1)}>Previous panel</button><span>Panel {panel + 1} of 4</span><button disabled={panel === 3} onClick={() => setPanel(panel + 1)}>Next panel</button></div>
    <details><summary>Learn more: reproducibility and full precision</summary><p>The Lab uses a fixed random seed by default, so repeating an unchanged run reproduces its counts. This helps compare experiments. It does not turn counts into ideal probabilities.</p><p>These are archived values for the exact collected circuit, including its gate IDs, shot count and seed. Editing a Lab draft does not relabel this record. Display tolerance is 1e-10; the returned numbers below retain full precision.</p><pre tabIndex={0} aria-label="Collected experiment JSON">{JSON.stringify(evidence, null, 2)}</pre></details>
  </section>;
}
