import { useState } from 'react';
import { Link, navigate } from '../app/navigation';
import CircuitCanvas from '../lab/CircuitCanvas';
import SimulatorSelector from '../lab/SimulatorSelector';
import QuestionCard from '../lesson/QuestionCard';
import type { Question } from '../lesson/content';
import { requestKey } from './api';
import { useVariational } from './useVariational';
import { openVariationalWorkspace } from './workspace';
import VariationalResults, { Convergence } from './VariationalResults';
import type { Definition, GraphId, VariationalId } from './types';
import '../lab/lab.css';
import '../lab/explorer.css';
import '../algorithms/algorithms.css';
import './variational.css';

const nothing = () => {};
function AngleEditor({ definition, onApply }: { definition: Definition; onApply: (a: number[]) => void }) {
  const [values, setValues] = useState(definition.boundParameters.map(String));
  const valid = values.every(s => s.trim() !== '' && Number.isFinite(Number(s)) && Math.abs(Number(s)) <= Math.PI);
  return <form className="variational-angles" onSubmit={e => { e.preventDefault(); if (valid) onApply(values.map(Number)); }}>
    <p>Set initial angles only. The optimizer may change each within [−π, π]. Edits take effect when you apply them.</p>
    {definition.parameterOrder.map((name, i) => <label key={name}>{name}<input aria-label={name} inputMode="decimal" value={values[i]} onChange={e => setValues(old => old.map((v, j) => i === j ? e.target.value : v))} /></label>)}
    {!valid && <p role="alert">Enter a finite angle between −π and π for every parameter.</p>}
    <button className="q-button q-button-secondary" disabled={!valid}>Apply initial angles</button>
  </form>;
}
function GraphLesson({ definition }: { definition: Definition }) {
  const graph = definition.problem.graph!;
  const [partition, setPartition] = useState(0);
  const points = graph.numVertices === 2 ? [[85, 100], [275, 100]] : [[60, 150], [180, 45], [300, 150]];
  const bitstring = partition.toString(2).padStart(graph.numVertices, '0');
  return <div className="variational-graph"><h3>Try a cut, classically</h3><p>Use a vertex button to move it between group 0 and group 1. Highlighted edges cross the groups.</p>
    <svg viewBox="0 0 360 195" role="img" aria-label={`${definition.problem.title}, partition ${bitstring}`}>
      {graph.edges.map(e => { const a = points[e.source]!, b = points[e.target]!, crossing = ((partition >> e.source) ^ (partition >> e.target)) & 1;
        return <g key={`${e.source}-${e.target}`}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={crossing ? 'cut-edge' : ''} /><text x={(a[0]! + b[0]!) / 2} y={(a[1]! + b[1]!) / 2 - 10}>{e.weight}</text></g>; })}
      {points.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="22" className={partition & (1 << i) ? 'group-one' : ''} /><text x={p[0]} y={p[1]! + 5} className="vertex-label">{i}</text></g>)}
    </svg>
    <div className="algorithm-stage-buttons">{points.map((_, i) => <button key={i} aria-label={`Move vertex ${i}`} aria-pressed={!!(partition & (1 << i))} onClick={() => setPartition(p => p ^ (1 << i))}>Vertex {i} · group {(partition >> i) & 1}</button>)}</div>
    <p data-testid="classical-cut"><code>{bitstring}</code> → cut value {definition.reference.cutValues[bitstring]}. Classical maximum: {definition.reference.value}.</p>
    <p>q0 / vertex 0 is the rightmost bit. Enumeration checks all {2 ** graph.numVertices} partitions; it is our exact reference, not a quantum result.</p>
  </div>;
}
function question(id: VariationalId, check = false): Question {
  const prompt = check ? id === 'vqe' ? 'Why can’t computational-basis probabilities alone give this Hamiltonian’s energy?' : 'Does an expected cut of 1.65 mean every measured cut has value 1.65?'
    : id === 'vqe' ? 'What do you expect as the optimizer tries different angles?' : 'Will a shallow QAOA run always measure an optimal cut?';
  const options = check ? id === 'vqe' ? ['They are sufficient for every operator', 'The X terms also depend on relative phases', 'Energy is just the most frequent bitstring']
    : ['Yes, every sample equals the expectation', 'No; expectation averages the cut values over many possible outcomes', 'Only on quantum hardware']
    : ['The exact optimum is guaranteed', 'It can improve, but the budget and starting angles matter', 'I’m not sure yet'];
  return { id: `${id}-${check ? 'check' : 'predict'}`, prompt, options, correct: 1,
    feedback: check ? ['Revisit expectation values above: an average is not one sample, and phases matter for X/Y operators.', 'Correct. Exact expectations use the quantum state and the observable; a sampled bitstring is a different kind of evidence.', 'No hardware is involved here. Revisit the distinction between a state expectation and a measurement.']
      : options.map(() => 'Prediction recorded. Run the real optimizer, then compare your expectation with the observed history and reference gap.') };
}
export default function Variational({ id }: { id: VariationalId }) {
  const e = useVariational(id), r = e.request, d = e.definition, vqe = id === 'vqe';
  const result = e.job?.result ?? null;
  return <main className="q-page algorithm-page variational-page">
    <Link className="q-text-link" href="/algorithms">← All algorithms</Link>
    <header className="algorithm-module-header"><div><p className="q-eyebrow">ALGORITHM EXPLORER / {vqe ? '03 · FIND A LOW-ENERGY STATE' : '04 · SEARCH FOR A GOOD CUT'}</p><h1>{vqe ? 'VQE' : 'QAOA'}</h1><p>{vqe ? 'Variational Quantum Eigensolver' : 'Quantum Approximate Optimization Algorithm'}</p><div className="q-inline-meta"><span>Real hybrid optimization</span><span>{vqe ? '2 qubits · 4 angles' : '2–3 vertices · 1–2 layers'}</span><span>Local simulation only</span></div></div></header>
    <nav className="algorithm-jump-nav" aria-label="Variational learning sections"><a href="#problem">Understand</a><a href="#experiment">Circuit & parameters</a><a href="#optimize">Predict & optimize</a><a href="#inspect">Inspect evidence</a><a href="#understanding">Check understanding</a></nav>
    <section id="problem" className="variational-problem"><div className="algorithm-section-label"><span>01</span><h2>{vqe ? 'Find the lowest energy you can.' : 'Put connected vertices on opposite sides.'}</h2></div>
      <div className="algorithm-results-grid"><div><h3>The problem</h3>{vqe ? <><p>A <strong>Hamiltonian</strong> is an operator that assigns energy to a quantum state. Our educational two-spin model is <code>H = −IX − XI + 0.5 ZZ</code>. These are dimensionless energy units, not molecular or laboratory predictions.</p><p>The <strong>ground state</strong> has the smallest possible energy. Classically, we can diagonalize this tiny 4 × 4 matrix to find it exactly: <code>E₀ = −√17 / 2 ≈ −2.06155281</code>.</p><p>In a Pauli string, the left letter acts on q1 and the right on q0. So IX means X on q0; XI means X on q1.</p></>
        : <><p><strong>MaxCut</strong> divides vertices into two groups to maximize the total weight of edges crossing between them. A bitstring records the groups: 0 on one side, 1 on the other.</p><p>For an edge i–j, <code>Cᵢⱼ = wᵢⱼ(I − ZᵢZⱼ) / 2</code>. Equal bits contribute zero; different bits contribute the positive edge weight. The total cost operator C adds these terms.</p><p>For these tiny graphs we enumerate every partition exactly. That maximum is a classical reference, separate from QAOA’s result.</p></>}</div>
      <div><h3>The quantum idea</h3>{vqe ? <><p>An <strong>ansatz</strong> is a tunable family of circuits. Our RY rotations choose directions, a CX allows entanglement, and two final RY rotations adjust the correlated state.</p><p>For each parameter vector θ, the simulator prepares |ψ(θ)⟩. Its <strong>expectation value</strong> is the average energy <code>E(θ) = ψ†Hψ</code>. Complex amplitudes—not just measurement probabilities—are needed for X and Y terms.</p><p>The <strong>variational principle</strong> says a normalized trial state has E(θ) ≥ E₀, apart from numerical tolerance. A small gap is evidence of a good trial energy; it does not guarantee every optimizer succeeds.</p></>
        : <><p>Hadamard gates begin with every partition in superposition. A <strong>cost layer</strong> applies <code>exp(−iγC)</code>, encoding cut values in phases. A <strong>mixer layer</strong> applies <code>exp(−iβΣX)</code>, so amplitudes interfere.</p><p>Each edge uses CX → P(−γw) → CX. The target holds the edge’s parity temporarily, so the P gate applies exactly the desired phase. RX(2β) on every vertex is the mixer. No unsupported RZZ gate is needed.</p><p>Repeat these layers p times. We <strong>maximize expected cut</strong> by asking a minimizer to minimize its negative. Expected cut is an average, not a promised measurement or quantum advantage.</p></>}</div></div>
      <div className="variational-loop" aria-label="Hybrid optimization loop"><span>1 · Bind angles</span><span>2 · Simulate state</span><span>3 · Calculate expectation</span><span>4 · Optimizer chooses new angles ↺</span></div>
      <p>A classical <strong>optimizer</strong> (bounded SciPy Powell) tries new angles using the calculated objective. Here evaluations are exact and noiseless; only the final measurement counts are sampled. Each outer iteration may need many objective evaluations.</p>
    </section>
    <section id="experiment" className="algorithm-experiment"><div className="algorithm-section-label"><span>02</span><h2>Choose one exact experiment.</h2></div>
      <div className="algorithm-controls-grid"><div className="algorithm-parameters">
        <SimulatorSelector value={r.backend} onChange={backend => e.change({ ...r, backend })} />
        {r.algorithm === 'qaoa' && <><label>Graph<select aria-label="MaxCut graph" value={r.problemId} onChange={ev => e.change({ ...r, problemId: ev.target.value as GraphId, initialParameters: null })}>{(e.catalog?.problems.filter(p => p.graph) ?? []).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Depth p<select aria-label="QAOA depth" value={r.depth} onChange={ev => e.change({ ...r, depth: Number(ev.target.value), initialParameters: null })}><option value="1">1 · One cost / mixer pair</option><option value="2">2 · Two cost / mixer pairs</option></select></label></>}
        <label>Starting point<select aria-label="Initialization seed" value={r.initializationSeed} onChange={ev => e.change({ ...r, initializationSeed: Number(ev.target.value), initialParameters: null })}>{[42, 7, 0].map(seed => <option key={seed} value={seed}>Seed {seed} · seeded angles</option>)}</select></label>
        <label>Objective evaluation budget<select aria-label="Evaluation budget" value={r.maxEvaluations} onChange={ev => e.change({ ...r, maxEvaluations: Number(ev.target.value) })}>{[4, 64, 128, 256].map(n => <option key={n} value={n}>{n} evaluations{n === 4 ? ' · tiny-budget demonstration' : ''}</option>)}</select></label>
        <label>Final measurement shots<select aria-label="Optimization shots" value={r.shots} onChange={ev => e.change({ ...r, shots: Number(ev.target.value) })}>{[128, 1024, 8192].map(n => <option key={n} value={n}>{n} shots</option>)}</select></label>
        <details className="algorithm-details"><summary>Execution limits & initial angles</summary>
          <label>Maximum optimizer iterations<select aria-label="Optimization iteration limit" value={r.maxIterations} onChange={ev => e.change({ ...r, maxIterations: Number(ev.target.value) })}>{[1, 12, 20].map(n => <option key={n}>{n}</option>)}</select></label>
          <label>Wall-clock limit<select aria-label="Optimization time limit" value={r.timeLimitSeconds} onChange={ev => e.change({ ...r, timeLimitSeconds: Number(ev.target.value) })}>{[1, 5, 20, 30].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label>
          {d && <AngleEditor key={requestKey(r)} definition={d} onApply={initialParameters => e.change({ ...r, initialParameters })} />}
          {r.initialParameters && <button onClick={() => e.change({ ...r, initialParameters: null })}>Restore seeded angles</button>}
        </details><p className="q-muted">One local optimization at a time; up to 4 parameters, 256 evaluations, 20 iterations and 30 seconds, including worker startup. Changing a selection cancels the previous job and clears its evidence. Initialization seed and sample seed ({r.seedSimulator}) serve different purposes.</p>
      </div>{d && !vqe ? <GraphLesson key={d.problem.id} definition={d} /> : <div className="algorithm-search-note"><h3>A family of trial states</h3><p>θ0: RY on q0; θ1: RY on q1; CX q0→q1; θ2: RY on q0; θ3: RY on q1.</p><p>Four angles, five real gates. The ansatz can entangle the spins, unlike two independent rotations alone.</p><p>Try a tiny evaluation budget, then a larger one. Changing the starting seed is another useful experiment. A different seed need not find the same local solution.</p></div>}</div>
      {e.invalidated && <p className="algorithm-notice" role="status">Selections changed. Old results were cleared and any previous optimization was asked to stop.</p>}
      {e.building && <p role="status">Building the initial parameterized circuit…</p>}
      {e.buildError && <div role="alert" className="algorithm-error"><p>{e.buildError}</p><button onClick={e.retry}>Retry preview</button></div>}
      {d && <><h3>Initial circuit preview</h3><p>{d.ansatz}. Angles in radians: {d.boundParameters.map(a => a.toFixed(5)).join(', ')}. Bit order: q[n−1]…q[0], q0 rightmost.</p>
        <ol className="algorithm-stage-overview">{d.stages.map(s => <li key={s.id}><strong>{s.title}</strong><p>{s.description}</p><small>Gates {s.startStep + 1}–{s.endStep}</small></li>)}</ol>
        <div className="lab algorithm-lab-embed algorithm-circuit"><CircuitCanvas request={d.circuit} readOnly selectedId={null} tool="h" pending={null} dragTool={null} traceStep={null} onCell={nothing} onSelect={nothing} onCancel={nothing} onDeselect={nothing} onDrop={nothing} /></div>
        <button className="q-button q-button-secondary" onClick={() => navigate(openVariationalWorkspace(d))}>Open initial circuit in Lab ↗</button>
      </>}
    </section>
    <section id="optimize" className="algorithm-predict"><div className="algorithm-section-label"><span>03</span><h2>Predict, then optimize.</h2></div>
      <QuestionCard key={requestKey(r)} question={question(id)} prediction submitted={e.prediction} onSubmit={e.predict} />
      <div className="algorithm-run-strip"><button className="q-button q-button-primary" disabled={!d || e.building || e.busy || e.prediction === undefined} onClick={() => void e.run()}>{e.busy ? 'Optimizing…' : 'Run optimization'}</button>{e.busy && <button className="q-button q-button-secondary" disabled={e.cancelling} onClick={() => void e.cancel()}>{e.cancelling ? 'Stopping worker…' : 'Cancel optimization'}</button>}<p>{e.prediction === undefined ? 'Record a prediction first. “I’m not sure” is welcome.' : 'Uses actual state evaluations; no generated curves or hardware execution.'}</p></div>
      {e.busy && <p role="status">{e.cancelling ? 'Waiting for the backend to stop and reap its worker.' : `Optimization running · ${e.job?.history.length ?? 0} / ${r.maxEvaluations} evaluations received.`}</p>}
      {e.error && <div role="alert" className="algorithm-error"><p>{e.error}</p><p>No final result is displayed. Retry when the local slot and connection are available.</p></div>}
      {e.job && e.job.status !== 'running' && e.job.status !== 'completed' && <p role="status" className="algorithm-notice">{e.job.status.replaceAll('_', ' ')}: {e.job.message} {e.job.history.length} evaluations were recorded before stopping.</p>}
      {e.job && !result && d && <Convergence history={e.job.history} definition={d} />}
    </section>
    {result ? <VariationalResults key={e.job!.jobId} result={result} /> : <section id="inspect" className="algorithm-awaiting"><h2>Your optimization evidence will appear here.</h2><p>Compare the best observed objective against an independent exact reference, then inspect the circuit’s state.</p></section>}
    <section id="understanding" className="algorithm-understanding"><div className="algorithm-section-label"><span>05</span><h2>Check the idea.</h2></div><QuestionCard question={question(id, true)} submitted={e.answer} onSubmit={e.setAnswer} /><p className="q-muted">Practice only: no lesson or Challenge grading changes. Selections survive reload in this tab; optimization results are not resumed automatically. Jobs expire locally after 10 minutes, with at most eight retained.</p></section>
    <footer className="q-page-footer"><Link href={`/algorithms/${vqe ? 'qaoa' : 'vqe'}`} className="q-text-link">Explore {vqe ? 'QAOA' : 'VQE'} →</Link><Link href="/learn" className="q-text-link">Revisit foundations</Link></footer>
  </main>;
}
