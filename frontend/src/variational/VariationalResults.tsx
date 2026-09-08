import { useState } from 'react';
import { navigate } from '../app/navigation';
import { simulatorLabels } from '../api/types';
import StateExplorer from '../lab/StateExplorer';
import BlochSphere from '../lab/BlochSphere';
import { ProbabilityBars } from '../lab/QuantumStateViews';
import type { Definition, Evaluation, Result } from './types';
import { openVariationalWorkspace } from './workspace';

export const decimal = (x: number) => (Math.abs(x) < 1e-10 ? 0 : x).toFixed(8);
export function Convergence({ history, definition }: { history: Evaluation[]; definition: Definition }) {
  const vqe = definition.request.algorithm === 'vqe', sign = vqe ? 1 : -1;
  const reference = definition.reference.value;
  const values = [reference, ...history.map(h => h.expectation)];
  const low = Math.min(...values), high = Math.max(...values), span = Math.max(.1, high - low);
  const x = (i: number) => 62 + i / Math.max(1, history.length - 1) * 560;
  const y = (v: number) => 28 + (high + .08 * span - v) / (1.16 * span) * 210;
  return <section className="variational-convergence" aria-label="Optimization convergence">
    <h3>{vqe ? 'Follow the energy downward' : 'Follow the expected cut upward'}</h3>
    <p>Each point is a real, exact state evaluation. The optimizer may try worse angles; we retain the best observed state.</p>
    {history.length ? <><svg viewBox="0 0 660 280" role="img" aria-label={`${history.length} actual evaluations; ${vqe ? 'energy' : 'expected cut'} and best observed value`}>
      <line x1="62" x2="622" y1={y(reference)} y2={y(reference)} className="variational-reference" />
      <polyline className="variational-trials" points={history.map((h, i) => `${x(i)},${y(h.expectation)}`).join(' ')} />
      <polyline className="variational-best" points={history.map((h, i) => `${x(i)},${y(sign * h.bestObjective)}`).join(' ')} />
      {history.length === 1 && <circle cx={x(0)} cy={y(history[0]!.expectation)} r="4" className="variational-dot" />}
      <text x="4" y="24">{high.toFixed(3)}</text><text x="4" y="240">{low.toFixed(3)}</text>
      <text x="62" y="270">Evaluation 1</text><text x="622" y="270" textAnchor="end">{history.length}</text>
    </svg><p className="variational-legend"><span>Light: evaluated state</span><span>Dark: best observed</span><span>Dashed: exact classical reference ({decimal(reference)})</span></p>
      <details className="algorithm-details"><summary>Evaluation history · {history.length} real objective calls</summary><div className="variational-table-scroll"><table className="algorithm-counts"><caption>Angles in radians; iteration = completed Powell sweeps when evaluated</caption><thead><tr><th>Evaluation</th><th>Iteration</th><th>{vqe ? 'Energy' : 'Expected cut'}</th><th>Minimized objective</th><th>Angles</th></tr></thead><tbody>{history.map(h => <tr key={h.evaluation}><td>{h.evaluation}</td><td>{h.iteration}</td><td>{decimal(h.expectation)}</td><td>{decimal(h.objective)}</td><td>{h.parameters.map(a => a.toFixed(5)).join(', ')}</td></tr>)}</tbody></table></div></details>
    </> : <p role="status">Waiting for the first quantum state evaluation. Worker startup is included in the time limit.</p>}
  </section>;
}

export default function VariationalResults({ result }: { result: Result }) {
  const d = result.definition, o = result.optimization, vqe = d.request.algorithm === 'vqe';
  const [index, setIndex] = useState(result.trace.steps.length - 1), [pane, setPane] = useState<'joint' | 'qubit'>('joint');
  const [counts, showCounts] = useState(false);
  const step = result.trace.steps[index]!;
  const snapshot = { request: d.circuit, response: result.trace, rawResponse: JSON.stringify(result.trace, null, 2) };
  return <section id="inspect" className="algorithm-observations" aria-label="Variational results">
    <div className="algorithm-section-label"><span>04</span><h2>The evidence from your experiment.</h2></div>
    <div className="variational-metrics">
      <div><span>Best observed {vqe ? 'energy' : 'expected cut'}</span><strong data-testid="variational-best">{decimal(o.bestExpectation)}</strong><small>Initial: {decimal(o.initialExpectation)}</small></div>
      <div><span>Exact classical {vqe ? 'ground energy' : 'maximum cut'}</span><strong>{decimal(d.reference.value)}</strong><small>{d.reference.method} · not an optimizer output</small></div>
      <div><span>Gap to exact reference</span><strong data-testid="variational-gap">{Math.abs(result.referenceGap) >= 1e-12 && Math.abs(result.referenceGap) < 1e-5 ? result.referenceGap.toExponential(3) : decimal(result.referenceGap)}</strong><small>{d.problem.units}</small></div>
    </div>
    <p data-testid="variational-stop">Stopped: {o.stoppingReason.replaceAll('_', ' ')} · {o.evaluations} / {d.request.maxEvaluations} evaluations · {o.iterations} / {d.request.maxIterations} iterations.</p>
    <p>{o.converged ? 'Converged means the optimizer met its local stopping test. It is not proof of a global optimum.' : 'The budget or optimizer stopping rule ended this run. This is the best state actually observed within that budget.'}</p>
    <p className="lab-result-backend" data-testid="variational-backend">Result from {simulatorLabels[result.simulation.backend]} · local CPU simulation</p>
    <Convergence history={o.history} definition={d} />
    <div className="algorithm-results-grid"><div><h3>Which angles worked best?</h3><div className="variational-table-scroll"><table className="algorithm-counts"><caption>Parameter ordering · radians · bounded to [−π, π]</caption><thead><tr><th>Parameter</th><th>Initial</th><th>Best observed</th></tr></thead><tbody>{d.parameterOrder.map((label, i) => <tr key={label}><th>{label}</th><td>{decimal(o.initialParameters[i]!)}</td><td>{decimal(o.bestParameters[i]!)}</td></tr>)}</tbody></table></div>
      <p>The circuit and state below use the best angles, not the last unsuccessful trial.</p>
      <button className="q-button q-button-secondary" onClick={() => navigate(openVariationalWorkspace(d))}>Open optimized circuit in Lab ↗</button><p className="q-muted">A separate draft preserves your free circuit, Code Mode and Undo history.</p>
    </div><div className="lab algorithm-lab-embed algorithm-distribution">
      <div className="lab-actions" role="group" aria-label="Variational distribution"><button aria-pressed={!counts} onClick={() => showCounts(false)}>Ideal probabilities</button><button aria-pressed={counts} onClick={() => showCounts(true)}>Sampled counts</button></div>
      {counts ? <table className="algorithm-counts"><caption>{result.simulation.shots} terminal measurement shots</caption><thead><tr><th>Bitstring</th><th>Count</th>{result.cut && <th>Cut value</th>}</tr></thead><tbody>{Object.entries(result.simulation.counts).sort(([a], [b]) => a.localeCompare(b)).map(([b, n]) => <tr key={b} data-testid={`variational-count-${b}`}><th><code>{b}</code></th><td>{n}</td>{result.cut && <td>{d.reference.cutValues[b]}</td>}</tr>)}</tbody></table>
        : <ProbabilityBars probabilities={result.simulation.probabilities} prefix="variational" />}
      <p className="lab-muted">Ideal probabilities are exact squared amplitudes. Counts are real sampled measurements using seed {result.simulation.metadata.seedSimulator}; they do not drive this optimizer.</p>
    </div></div>
    {result.cut && <div className="algorithm-comparison"><h3>From bitstrings to cuts</h3><p data-testid="optimal-cut-probability">Ideal probability of an optimal cut: {(100 * result.cut.optimalCutProbability).toFixed(4)}%.</p><p data-testid="best-sampled-cut">Best sampled candidate: <code>{result.cut.bestSampledBitstring}</code> · cut {result.cut.bestSampledCut} · observed {result.cut.bestSampledCount} times.</p><p>Read vertex 0 from the rightmost bit. Vertices with different bits are in different groups; only their connecting edges cross. Complementary strings describe the same cut. Among the highest-valued sampled cuts, ties select the most frequent bitstring, then the lexicographically first.</p></div>}
    <h3>Explore the best trial state, gate by gate</h3><p>This is the final circuit’s trace, not an animation of optimizer iterations. It includes step zero and every gate.</p>
    <div className="algorithm-stage-buttons" role="group" aria-label="Inspect variational stages"><button aria-pressed={index === 0} onClick={() => setIndex(0)}>Initial zeros</button>{d.stages.map(s => <button key={s.id} aria-pressed={index === s.endStep} onClick={() => setIndex(s.endStep)}>{s.title}<small>Step {s.endStep}</small></button>)}</div>
    <div className="lab algorithm-lab-embed algorithm-state-layout" data-pane={pane}>
      <StateExplorer embedded blocked={false} pane={pane} onPane={setPane} trace={{ snapshot, index, setIndex, step, stale: false, loading: false, error: null, cancelled: false, run: async () => {} }} />
      <div className="algorithm-bloch"><BlochSphere step={step} /><p className="lab-muted">Each sphere is a reduced single-qubit state. Entanglement can make it mixed; its purity need not be 1.</p></div>
    </div>
    <h3>Explain what happened</h3><p>{result.explanation}</p>
    <details className="algorithm-details algorithm-raw"><summary>Reproducibility · exact circuit, parameters & raw data</summary>
      <p>Exact objective engine: {o.objectiveEngine}. Classical optimizer: SciPy {o.scipyVersion} / Powell. No shots are used for objective values. Final samples use {simulatorLabels[result.simulation.backend]}.</p>
      <p>Native global phase and full precision are preserved. Bit order is q[n−1]…q[0]. Seeds reproduce initial parameters and within-framework samples; different frameworks can take different numerical line-search paths or sample different counts.</p>
      <pre tabIndex={0} aria-label="Variational run JSON">{JSON.stringify(result, null, 2)}</pre>
    </details>
  </section>;
}
