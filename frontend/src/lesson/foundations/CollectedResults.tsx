import { useState } from 'react';
import BlochSphere from '../../lab/BlochSphere';
import { formatNumber, ProbabilityBars, StatevectorTable } from '../../lab/QuantumStateViews';
import type { ExperimentDefinition } from './types';
import type { FoundationEvidence } from './state';

export default function CollectedResults({ experiment, evidence }: { experiment: ExperimentDefinition; evidence: FoundationEvidence }) {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState('Probabilities');
  const step = evidence.trace.steps[index]!;
  const simulation = evidence.simulation;
  return <section className="lesson-observation" aria-label="Your real experiment results">
    <p className="lesson-source">Your collected {experiment.title} experiment · {evidence.request.shots.toLocaleString('en-US')} shots · Qiskit</p>
    <div className="lesson-callout"><p>Your prediction: <strong>{experiment.prediction.options[evidence.prediction]}</strong>.</p><p>Observed ideal final probabilities: {evidence.trace.basisOrder.map((label) => `${label}: ${formatNumber(simulation.probabilities[label]! * 100)}%`).join(' · ')}.</p><p>{evidence.prediction === experiment.prediction.options.length - 1 ? 'You now have evidence to explain the outcome.' : evidence.prediction === experiment.prediction.correct ? 'Your prediction agrees with the experiment.' : 'Your observation differs from your prediction. Follow the steps below to explain the change.'}</p></div>
    <div className="lesson-result-panels" role="group" aria-label="Collected result views">{['Probabilities', 'Amplitudes', 'Qubit state', 'Sampled counts'].map((name) => <button key={name} aria-pressed={panel === name} onClick={() => setPanel(name)}>{name}</button>)}</div>
    {panel !== 'Sampled counts' && <><div className="lesson-step-buttons" role="group" aria-label="Collected experiment steps">{evidence.trace.steps.map((s) => <button key={s.index} aria-pressed={index === s.index} onClick={() => setIndex(s.index)}>{s.gate ? `Step ${s.index}: ${s.gate.type.toUpperCase()}` : 'Step 0: Initial'}</button>)}</div><p role="status">{experiment.observations[index]}</p><p className="lesson-source">Selected snapshot: step {index}. Every snapshot is before measurement.</p></>}
    {panel === 'Probabilities' && <ProbabilityBars probabilities={step.probabilities} prefix="collected" />}
    {panel === 'Amplitudes' && <><p>A statevector lists the amplitudes in basis order. Real and Imaginary are the two parts of a complex number. In these experiments the imaginary parts are zero; the sign of the real part is meaningful before squaring its magnitude.</p><StatevectorTable statevector={step.statevector} basis={evidence.trace.basisOrder} label="Collected amplitudes" /></>}
    {panel === 'Qubit state' && <><p>A Bloch sphere maps one qubit’s state, not a physical position. +Z represents |0⟩, −Z represents |1⟩, and ±X represent equal magnitudes with matching or opposite signs. A centered vector represents a maximally mixed reduced state.</p><div className="lesson-sphere"><BlochSphere step={step} beginner={evidence.lessonId === 'measurement'} /></div></>}
    {panel === 'Sampled counts' && <><p>These counts always belong to the final measurement of the full collected circuit. Each shot starts the preparation again.</p><table className="foundation-table"><caption>Real sampled counts · {simulation.shots.toLocaleString('en-US')} shots</caption><thead><tr><th scope="col">Outcome</th><th scope="col">Ideal chance</th><th scope="col">Count</th></tr></thead><tbody>{evidence.trace.basisOrder.map((label) => <tr key={label}><th scope="row">{label}</th><td>{formatNumber(simulation.probabilities[label]! * 100)}%</td><td>{simulation.counts[label]}</td></tr>)}</tbody></table><p>Counts fluctuate across different random samples. The fixed seed {simulation.metadata.seedSimulator} reproduces this sample with the same circuit, shot count, and engine configuration.</p></>}
    <details><summary>Collected circuit and full precision</summary><p>This is the archived request and its real responses. Editing your Lab draft does not change this record. Display comparisons use a tolerance of 1e-10; the numbers below keep their returned precision.</p><pre tabIndex={0} aria-label="Collected experiment JSON">{JSON.stringify(evidence, null, 2)}</pre></details>
  </section>;
}
