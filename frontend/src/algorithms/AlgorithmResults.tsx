import { useState } from 'react';
import { simulatorLabels } from '../api/types';
import StateExplorer from '../lab/StateExplorer';
import BlochSphere from '../lab/BlochSphere';
import { ProbabilityBars } from '../lab/QuantumStateViews';
import type { AlgorithmRun } from './types';
import AlgorithmPlayback from './AlgorithmPlayback';

export function percent(p: number) {
  const display = Math.abs(p) < 1e-10 ? 0 : Math.abs(1 - p) < 1e-10 ? 1 : p;
  return `${(display * 100).toFixed(2)}%`;
}
export default function AlgorithmResults({ result }: { result: AlgorithmRun }) {
  const [index, setIndex] = useState(result.trace.steps.length - 1);
  const [pane, setPane] = useState<'joint' | 'qubit'>('joint');
  const [tab, setTab] = useState<'ideal' | 'counts'>('ideal');
  const m = result.interpretation, d = result.definition;
  const step = result.trace.steps[index]!;
  const probabilities = m.algorithm === 'deutsch-jozsa' ? m.inputProbabilities : result.simulation.probabilities;
  const counts = m.algorithm === 'deutsch-jozsa' ? m.inputCounts : result.simulation.counts;
  const snapshot = { request: d.circuit, response: result.trace, rawResponse: JSON.stringify(result.trace, null, 2) };
  const selectedStage = [...d.stages].reverse().find(s => s.endStep === index)
    ?? d.stages.find(s => index > s.startStep && index <= s.endStep);
  return <section id="inspect" className="algorithm-observations" aria-label="Algorithm results">
    <div className="algorithm-section-label"><span>04</span><h2>Inspect what happened.</h2></div>
    <div className="algorithm-result-summary">
      <div><p className="q-eyebrow">{m.algorithm === 'deutsch-jozsa' ? 'INPUT-REGISTER CONCLUSION' : 'MARKED-ITEM IDEAL PROBABILITY'}</p>
        <h3 data-testid="algorithm-conclusion">{m.algorithm === 'deutsch-jozsa' ? `${m.classification[0]!.toUpperCase()}${m.classification.slice(1)}${m.classification === 'inconclusive' ? '' : ' function'}` : percent(m.successProbability)}</h3>
        <p>{m.algorithm === 'deutsch-jozsa' ? `All-zero input: ${percent(m.zeroInputProbability)} ideal probability` : `Item ${m.markedItem} · ${m.sampledSuccessCount} / ${result.simulation.shots} sampled hits`}</p>
      </div><p>{m.explanation}</p>
    </div>
    <div className="algorithm-results-grid">
      <div className="lab algorithm-lab-embed algorithm-distribution">
        <div className="lab-actions" role="group" aria-label="Algorithm result view"><button aria-pressed={tab === 'ideal'} onClick={() => setTab('ideal')}>Ideal probabilities</button><button aria-pressed={tab === 'counts'} onClick={() => setTab('counts')}>Sampled counts</button></div>
        <p className="lab-muted">{m.algorithm === 'deutsch-jozsa' ? 'Inputs only · the helper has been summed out.' : 'Each bitstring names one search item.'}</p>
        {tab === 'ideal' ? <ProbabilityBars probabilities={probabilities} prefix="algorithm" />
          : <table className="algorithm-counts"><caption>{result.simulation.shots} shots · one circuit execution per shot</caption><thead><tr><th scope="col">{m.algorithm === 'deutsch-jozsa' ? 'Input' : 'Item'}</th><th scope="col">Count</th><th scope="col">Frequency</th></tr></thead><tbody>{Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => <tr key={label} data-testid={`algorithm-count-${label}`}><th scope="row"><code>{label}</code></th><td>{count}</td><td>{percent(count / result.simulation.shots)}</td></tr>)}</tbody></table>}
        <p className="lab-muted">Ideal probabilities use squared amplitudes before measurement. Counts are repeated sampled measurements; they may fluctuate. This run used seed {result.simulation.metadata.seedSimulator}.</p>
      </div>
      <div className="algorithm-comparison">{m.algorithm === 'grover' ? <><h3>Iteration by iteration</h3><p>Observed at the uniform state and after each complete diffuser. Select a row to inspect that state below.</p>
        <div className="algorithm-iteration-chart" aria-label="Observed iteration probabilities">{m.iterations.map(o => <button key={o.iteration} aria-pressed={index === o.step} onClick={() => setIndex(o.step)}><span>{o.iteration === 0 ? '0 · Uniform' : `${o.iteration} · After diffuser`}</span><span className="algorithm-mini-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, o.successProbability)) * 100}%` }} /></span><strong>{percent(o.successProbability)}</strong></button>)}</div>
        <p>{m.iterations.length < 3 ? 'Try 2 or 4 iterations to compare amplification and over-rotation in a single run.' : 'The probability can fall after a successful iteration. More iterations do not always help.'}</p></>
        : <><h3>Read the right register</h3><div className="algorithm-register-key"><span>q{d.ancillaQubit}<small>helper · exclude</small></span><span>{[...d.inputRegister].reverse().map(q => `q${q}`).join(' ')}<small>inputs · classify</small></span></div><p>The full state is ordered <code>q[n-1]...q[0]</code>, with q0 on the right. Here n is the total qubit count. The helper is the leftmost bit.</p><p>For example, a full outcome <code>{'1' + '0'.repeat(d.inputRegister.length)}</code> still has an all-zero input. The leading 1 belongs to the helper and does not mean “balanced.”</p><p>One oracle query per quantum run versus up to {m.classicalWorstCaseQueries} classical queries for certainty. The shot count repeats the complete experiment; it is not one query shared by all shots.</p></>}</div>
    </div>
    <AlgorithmPlayback definition={d} steps={result.trace.steps} index={index} setIndex={setIndex} />
    <div className="algorithm-state-heading"><h3>Inspect the mathematical state</h3><p>The playback and this detailed explorer share the same verified API trace. Choose a stage boundary or timeline step; “Statevector” shows amplitudes, including signs that a probability chart cannot show.</p></div>
    <div className="algorithm-stage-buttons" role="group" aria-label="Inspect algorithm stages"><button aria-pressed={index === 0} onClick={() => setIndex(0)}>Initial zeros</button>{d.stages.map(s => <button key={s.id} aria-pressed={index === s.endStep} onClick={() => setIndex(s.endStep)} aria-label={`Inspect ${s.title}`}>{s.title}<small>Step {s.endStep}</small></button>)}</div>
    <p className="algorithm-stage-explanation" role="status">{selectedStage ? `${selectedStage.title}: ${selectedStage.description}` : 'Initial state: all qubits are 0, before preparation.'}</p>
    <div className="lab algorithm-lab-embed algorithm-state-layout" data-pane={pane}>
      <StateExplorer embedded blocked={false} pane={pane} onPane={setPane} trace={{ snapshot, index, setIndex, step, stale: false, loading: false, error: null, cancelled: false, run: async () => {} }} />
      <div className="algorithm-bloch"><BlochSphere step={step} /><p className="lab-muted">A sphere describes one qubit’s reduced state. It does not replace the joint statevector.</p></div>
    </div>
    <p className="lab-result-backend" data-testid="algorithm-backend">Result from {simulatorLabels[result.simulation.backend]} · local CPU</p>
    <details className="algorithm-details algorithm-raw"><summary>Run details · exact parameters, circuit & raw values</summary><p>Display tolerance: 1e-10. Raw values and native global phases are preserved. The full measurement includes every qubit; the Deutsch–Jozsa conclusion uses only the input register.</p><p>Circuit snapshot: <code>{d.circuitDigest}</code>. {result.simulation.backend === 'qiskit' ? `Qiskit ${result.simulation.metadata.qiskitVersion} · Aer ${result.simulation.metadata.aerVersion}` : `PennyLane ${result.simulation.metadata.pennylaneVersion} · default.qubit`} · seed {result.simulation.metadata.seedSimulator}.</p><pre tabIndex={0} aria-label="Algorithm run JSON">{JSON.stringify(result, null, 2)}</pre></details>
  </section>;
}
