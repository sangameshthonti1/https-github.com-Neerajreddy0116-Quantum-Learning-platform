import { useEffect, useMemo, useState } from 'react';
import type { Gate, TraceStep } from '../api/types';
import type { AlgorithmDefinition } from './types';

const speeds = [
  { label: '0.5×', delay: 1800 },
  { label: '1×', delay: 1000 },
  { label: '2×', delay: 500 },
] as const;

function gateLabel(gate: Gate | null) {
  if (!gate) return 'Initial state';
  const control = gate.controls.length ? `${gate.controls.map(q => `q${q}`).join(', ')} → ` : '';
  return `${gate.type.toUpperCase()} · ${control}${gate.targets.map(q => `q${q}`).join(', ')}`;
}

function gateExplanation(step: TraceStep, definition: AlgorithmDefinition) {
  const gate = step.gate;
  if (!gate) return 'Every qubit begins in |0⟩. No gate has acted yet.';
  const target = gate.targets.map(q => `q${q}`).join(' and ');
  const base = gate.type === 'h'
    ? `Hadamard on ${target} mixes the |0⟩ and |1⟩ amplitudes. Their signs matter when later gates make them interfere.`
    : gate.type === 'x'
      ? `X flips ${target}: |0⟩ and |1⟩ exchange places.`
      : gate.type === 'cx'
        ? `Controlled-X checks q${gate.controls[0]}. When that control is 1, it flips ${target}; otherwise it does nothing.`
        : gate.type === 'z'
          ? `Z leaves measurement probabilities unchanged now, but reverses the sign of amplitudes where ${target} is 1.`
          : gate.type === 'cz'
            ? `Controlled-Z reverses the sign only when q${gate.controls[0]} and ${target} are both 1.`
            : `${gate.type.toUpperCase()} acts on ${target}. Watch the returned state and probabilities update.`;
  if (definition.parameters.algorithm !== 'deutsch-jozsa') return base;
  const stage = definition.stages.find(item => step.index > item.startStep && step.index <= item.endStep)
    ?? definition.stages.find(item => item.startStep === item.endStep && step.index === item.endStep);
  if (stage?.id === 'oracle') return `${base} This gate is part of the oracle: together these operations encode f(x) as phase with one oracle query.`;
  if (stage?.id === 'interference') return `${base} This final input Hadamard converts the phase pattern into a measurable constant-or-balanced result.`;
  return base;
}

function probability(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return `${(bounded * 100).toFixed(Math.abs(bounded) < 1e-10 || Math.abs(1 - bounded) < 1e-10 ? 0 : 1)}%`;
}

export default function AlgorithmPlayback({ definition, steps, index, setIndex }: {
  definition: AlgorithmDefinition;
  steps: TraceStep[];
  index: number;
  setIndex: (index: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = steps.length - 1;
  const step = steps[index]!;
  const stage = useMemo(() => definition.stages.find(item => index > item.startStep && index <= item.endStep)
    ?? definition.stages.find(item => item.startStep === item.endStep && index === item.endStep), [definition.stages, index]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setIndex(index + 1), speeds[speed]!.delay);
    return () => window.clearTimeout(timer);
  }, [index, last, playing, setIndex, speed]);

  function toggle() {
    if (playing) { setPlaying(false); return; }
    if (index >= last) setIndex(0);
    setPlaying(true);
  }

  return <section className="algorithm-playback" aria-label="Circuit playback">
    <header className="algorithm-playback-header">
      <div><p className="q-eyebrow">GUIDED CIRCUIT PLAYBACK</p><h3>See the algorithm unfold</h3><p>Play the verified trace like a short video, or move one gate at a time.</p></div>
      <div className="algorithm-playback-actions">
        <button className="algorithm-play-button" onClick={toggle} aria-label={playing ? 'Pause circuit playback' : index >= last ? 'Replay circuit playback' : 'Play circuit playback'}>{playing ? '❚❚ Pause' : index >= last ? '↺ Replay' : '▶ Play'}</button>
        <label>Speed<select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{speeds.map((item, value) => <option key={item.label} value={value}>{item.label}</option>)}</select></label>
      </div>
    </header>
    <div className="algorithm-playback-progress" aria-hidden="true"><i style={{ width: `${last ? index / last * 100 : 100}%` }} /></div>
    <div className="algorithm-playback-step" aria-live="polite" aria-atomic="true">
      <div className="algorithm-playback-counter"><span>{String(index).padStart(2, '0')}</span><small>of {String(last).padStart(2, '0')}</small></div>
      <div><p className="algorithm-playback-stage">{stage?.title ?? 'Before the circuit'}</p><h4>{gateLabel(step.gate)}</h4><p data-testid="playback-explanation">{gateExplanation(step, definition)}</p></div>
    </div>
    <div className="algorithm-qubit-states" aria-label="Visible qubit states">
      {step.qubits.map(qubit => {
        const zero = (1 + qubit.blochVector.z) / 2;
        const one = 1 - zero;
        const length = Math.hypot(qubit.blochVector.x, qubit.blochVector.y, qubit.blochVector.z);
        return <article key={qubit.qubit} data-testid={`playback-qubit-${qubit.qubit}`}><div><strong>q{qubit.qubit}</strong><small>{definition.ancillaQubit === qubit.qubit ? 'helper' : 'input'}</small></div><div className="algorithm-qubit-bar" aria-label={`q${qubit.qubit}: probability 0 ${probability(zero)}, probability 1 ${probability(one)}`}><i style={{ width: `${Math.max(0, Math.min(1, zero)) * 100}%` }} /></div><span><b>0</b> {probability(zero)} · <b>1</b> {probability(one)}</span><small>{length < 1 - 1e-8 ? 'Mixed reduced state' : 'Pure reduced state'}</small></article>;
      })}
    </div>
    <div className="algorithm-playback-nav"><button onClick={() => { setPlaying(false); setIndex(Math.max(0, index - 1)); }} disabled={index === 0}>← Previous gate</button><button onClick={() => { setPlaying(false); setIndex(Math.min(last, index + 1)); }} disabled={index === last}>Next gate →</button></div>
    {index === last && definition.parameters.algorithm === 'deutsch-jozsa' && <p className="algorithm-playback-outcome"><strong>Now measure the input register.</strong> All input bits are 0 for a constant oracle; any input 1 means balanced. The helper is deliberately ignored.</p>}
  </section>;
}
