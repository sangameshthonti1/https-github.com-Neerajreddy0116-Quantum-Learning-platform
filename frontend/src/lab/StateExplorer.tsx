import { useEffect, useRef, useState } from 'react';
import type { TraceStep } from '../api/types';
import { displayTolerance, formatNumber, ProbabilityBars, StatevectorTable } from './QuantumStateViews';
import type { useStateTrace } from './useStateTrace';

type Trace = ReturnType<typeof useStateTrace>;

function stepName(step: TraceStep) {
  const gate = step.gate;
  return gate ? `${gate.type.toUpperCase()} ${gate.type === 'cx' ? `q${gate.controls[0]} → ` : ''}q${gate.targets[0]}` : 'Initial state';
}

function explain(step: TraceStep, previous?: TraceStep) {
  if (!step.gate || !previous) return 'Initial all-zero state, before any gate. All probabilities below come from the trace response.';
  const gate = step.gate;
  const operation = gate.type === 'h' ? `H on q${gate.targets[0]} mixes its |0⟩ and |1⟩ amplitudes with equal weights and a relative sign.`
    : gate.type === 'x' ? `X on q${gate.targets[0]} swaps its |0⟩ and |1⟩ amplitudes.`
      : gate.type === 'z' ? `Z on q${gate.targets[0]} changes the sign of amplitudes whose q${gate.targets[0]} bit is 1.`
        : `CX flips q${gate.targets[0]} only in basis components whose control q${gate.controls[0]} is 1.`;
  const changes = Object.entries(step.probabilities).filter(([label, p]) => Math.abs(p - previous.probabilities[label]!) > displayTolerance);
  const distribution = changes.length ? changes.map(([label, p]) => `|${label}⟩: ${formatNumber(previous.probabilities[label]! * 100)}% → ${formatNumber(p * 100)}%`).join('; ')
    : 'Ideal probabilities are unchanged at display precision; inspect amplitudes for phase changes.';
  return `${operation} ${distribution}`;
}

export default function StateExplorer({ trace, blocked, pane, onPane }: { trace: Trace; blocked: boolean; pane: 'joint' | 'qubit'; onPane: (pane: 'joint' | 'qubit') => void }) {
  const [view, setView] = useState<'probabilities' | 'statevector'>('probabilities');
  const timeline = useRef<HTMLDivElement | null>(null);
  const { snapshot, step, index, setIndex, loading, stale, error, cancelled } = trace;
  useEffect(() => {
    const container = timeline.current;
    const marker = container?.querySelector<HTMLElement>('[aria-current="step"]');
    if (container && marker) container.scrollLeft = Math.max(0, marker.offsetLeft - container.offsetLeft - container.clientWidth / 2 + marker.clientWidth / 2);
  }, [index]);
  return <section className="state-explorer" aria-label="State Explorer">
    <header className="lab-results-header"><div><h2>State Explorer</h2><p className="lab-muted">Ideal states before measurement · no sampled counts</p></div>
      <button className="lab-primary" onClick={() => void trace.run()} disabled={loading || blocked}>{loading ? 'Tracing…' : error ? 'Retry trace' : 'Trace circuit'}</button></header>
    {blocked && <p className="lab-notice">Apply shots or finish/cancel CX placement before tracing.</p>}
    {loading && <p role="status" className="lab-notice">Tracing circuit…</p>}
    {error && <div role="alert" className="lab-error"><strong>Trace could not complete</strong><p>{error}</p></div>}
    {!loading && (stale || cancelled) && <div role="status" className="lab-notice lab-stale-banner"><strong>Trace is stale</strong><p>The circuit changed{cancelled ? ' during tracing' : ''}. Trace again to inspect the current circuit. Previous intermediate states and highlights are hidden.</p></div>}
    {!snapshot && !error && !loading && !cancelled && <p className="lab-results-empty">Trace the circuit to inspect its initial state and every gate’s effect.</p>}
    {snapshot && <div className="explorer-mobile-view lab-actions" aria-label="Explorer data view">
      <button aria-pressed={pane === 'joint'} onClick={() => onPane('joint')}>Joint state</button>
      <button aria-pressed={pane === 'qubit'} onClick={() => onPane('qubit')}>Qubit sphere</button>
    </div>}
    {step && snapshot && <>
      <div className="trace-navigation">
        <div className="lab-actions"><button onClick={() => setIndex(index - 1)} disabled={index === 0}>Previous step</button>
          <span role="status" className="trace-step-heading">Step {index} of {snapshot.response.steps.length - 1} · {stepName(step)}</span>
          <button onClick={() => setIndex(index + 1)} disabled={index === snapshot.response.steps.length - 1}>Next step</button></div>
        <label className="sr-trace-label">Trace step<input aria-label="Trace step" aria-valuetext={`Step ${index}: ${stepName(step)}`} type="range" min="0" max={snapshot.response.steps.length - 1} value={index} disabled={snapshot.response.steps.length === 1} onChange={(event) => setIndex(Number(event.target.value))} /></label>
        <div className="trace-markers" aria-label="Trace timeline" ref={timeline}>
          {snapshot.response.steps.map((item) => <button key={item.index} aria-label={`Trace step ${item.index}: ${stepName(item)}`} aria-current={index === item.index ? 'step' : undefined} onClick={() => setIndex(item.index)}><span>{item.index}</span>{stepName(item)}</button>)}
        </div>
      </div>
      <p className="trace-explanation" data-testid="trace-explanation">{explain(step, snapshot.response.steps[index - 1])}</p>
      <div className="trace-joint-view">
      <div className="lab-actions" aria-label="Intermediate state view">
        <button aria-pressed={view === 'probabilities'} onClick={() => setView('probabilities')}>Step probabilities</button>
        <button aria-pressed={view === 'statevector'} onClick={() => setView('statevector')}>Step statevector</button>
        <span className="lab-muted">Basis: {snapshot.response.metadata.bitOrder}</span>
      </div>
      {view === 'probabilities' ? <ProbabilityBars probabilities={step.probabilities} prefix="trace" />
        : <StatevectorTable statevector={step.statevector} basis={snapshot.response.basisOrder} label="Trace statevector amplitudes" />}
      </div>
    </>}
    {snapshot && <details className="lab-details trace-joint-view"><summary>Trace Details</summary>
      <p className="lab-muted">{stale ? 'Previous circuit snapshot — stale.' : 'Request snapshot that produced this trace.'} {snapshot.request.numQubits} qubits · {snapshot.request.gates.length} gates · {snapshot.request.shots} requested shots.</p>
      <p className="lab-muted">Shots and seed are validated but do not affect this ideal trace. q0 is the rightmost bit. Display tolerance is 1e-10; raw precision is preserved below. Native global phase is retained; an overall phase does not change the physical state.</p>
      <h3>Trace request snapshot</h3><pre aria-label="Trace request JSON" tabIndex={0}>{JSON.stringify(snapshot.request, null, 2)}</pre>
      <h3>Trace response · full precision</h3><pre className="trace-raw-response" aria-label="Trace response JSON" tabIndex={0}>{snapshot.rawResponse}</pre>
    </details>}
  </section>;
}
