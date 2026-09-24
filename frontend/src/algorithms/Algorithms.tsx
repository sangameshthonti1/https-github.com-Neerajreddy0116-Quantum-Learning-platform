import { lazy } from 'react';
import { Link, navigate } from '../app/navigation';
import { ActionLink, Badge, PageHeading } from '../app/ui';
import CircuitCanvas from '../lab/CircuitCanvas';
import SimulatorSelector from '../lab/SimulatorSelector';
import { simulatorLabels } from '../api/types';
import QuestionCard from '../lesson/QuestionCard';
import type { Question } from '../lesson/content';
import { useAlgorithmCatalog, parameterKey } from './api';
import { AlgorithmMotif, ClassicalOracle, ProblemLesson } from './AlgorithmLesson';
import AlgorithmResults from './AlgorithmResults';
import { useExperiment } from './useExperiment';
import { openAlgorithmWorkspace } from './workspace';
import type { AlgorithmEntry, AlgorithmId, OracleId } from './types';
import '../lab/lab.css';
import '../lab/explorer.css';
import './algorithms.css';

const nothing = () => {};
const Variational = lazy(() => import('../variational/Variational'));
function prediction(id: AlgorithmId): Question {
  const options = id === 'deutsch-jozsa' ? ['All input bits will be 0', 'At least one input bit will be 1', 'I’m not sure yet']
    : ['25%', '50%', '100%', 'I’m not sure yet'];
  return { id: `predict-${id}`, prompt: id === 'deutsch-jozsa' ? 'What will the input register show for this oracle?' : 'What ideal chance will the marked item have after these iterations?',
    options, correct: 0, feedback: options.map(() => 'Prediction recorded for this configuration. Run the circuit and compare it with the observed result.') };
}
const checks: Record<AlgorithmId, Question> = {
  'deutsch-jozsa': { id: 'check-dj', prompt: 'With two input qubits and a helper q2, the full measurement is 100. What does it tell you under the promise?',
    options: ['Balanced, because the bitstring contains a 1', 'Constant, because the two input bits are 00', 'The function returns 1 on every input'], correct: 1,
    feedback: ['The leading 1 belongs to helper q2. Exclude it and read q1q0 = 00.', 'Correct. Only q1q0 = 00 classifies the function. The helper bit is excluded.', 'The circuit identifies constant versus balanced; it does not distinguish always 0 from always 1. Both give an all-zero input register.'] },
  grover: { id: 'check-grover', prompt: 'The phase oracle changes a positive amplitude to its negative. What changes immediately?',
    options: ['The marked probability becomes 100%', 'Its phase changes; its probability stays the same', 'A measurement reveals all the items'], correct: 1,
    feedback: ['Squaring the magnitude removes the sign. The diffuser is needed to convert relative signs into changed probabilities.', 'Correct. The sign changes but the squared magnitude does not. Later interference can change the probability.', 'Each measurement gives one item. The statevector is available here because this is a mathematical simulator.'] },
};

function Experiment({ entry }: { entry: AlgorithmEntry }) {
  const e = useExperiment(entry.id), p = e.parameters;
  const dj = p.algorithm === 'deutsch-jozsa';
  const n = dj ? p.inputQubits : p.numQubits;
  const oracles = entry.oracles.filter(o => o.inputQubits === n);
  const selectedOracle = dj ? oracles.find(o => o.id === p.oracleId) : undefined;
  const options = prediction(entry.id);
  const resultKey = e.result ? `${e.result.definition.circuitDigest}:${e.result.simulation.metadata.executionTimeMs}` : '';
  return <main className="q-page algorithm-page">
    <Link className="q-text-link" href="/algorithms">← All algorithms</Link>
    <header className="algorithm-module-header"><div><p className="q-eyebrow">ALGORITHM EXPLORER / {dj ? '01 · A GLOBAL PROPERTY' : '02 · AMPLITUDE AMPLIFICATION'}</p><h1>{entry.title}</h1><p>{dj ? 'Ask once. Let interference reveal the pattern.' : 'Make the right item more likely to appear.'}</p><div className="q-inline-meta"><Badge tone="blue">Interactive experiment</Badge><span>{dj ? '1–2 inputs + 1 helper' : '2 or 4 search items'}</span><span>Real local simulation</span></div></div><AlgorithmMotif id={entry.id} /></header>
    <nav className="algorithm-jump-nav" aria-label="Algorithm learning sections"><a href="#problem">Understand</a><a href="#experiment">Build & predict</a><a href="#inspect">Run & inspect</a><a href="#understanding">Check understanding</a></nav>
    <ProblemLesson id={entry.id} />
    <section id="experiment" className="algorithm-experiment" aria-label="Configure algorithm">
      <div className="algorithm-section-label"><span>02</span><h2>Make the problem yours.</h2></div>
      <div className="algorithm-controls-grid"><div className="algorithm-parameters">
        <SimulatorSelector value={p.backend ?? 'qiskit'} onChange={backend => e.change({ ...p, backend })} />
        <label>{dj ? 'Input register' : 'Search space'}<select aria-label={dj ? 'Input register' : 'Search space'} value={n} onChange={event => {
          const size = Number(event.target.value) as 1 | 2;
          e.change(p.algorithm === 'deutsch-jozsa' ? { ...p, inputQubits: size, oracleId: 'zero' }
            : { ...p, numQubits: size, markedItem: '0'.repeat(size) });
        }}><option value="1">{dj ? '1 input bit · 2 possible inputs' : '1 qubit · 2 items'}</option><option value="2">{dj ? '2 input bits · 4 possible inputs' : '2 qubits · 4 items'}</option></select></label>
        {p.algorithm === 'deutsch-jozsa' ? <><label>Oracle rule<select aria-label="Oracle rule" value={p.oracleId} onChange={event => e.change({ ...p, oracleId: event.target.value as OracleId })}>{oracles.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label><fieldset className="algorithm-example-switcher"><legend>Constant vs balanced examples</legend><div><button aria-pressed={p.oracleId === 'zero'} onClick={() => e.change({ ...p, oracleId: 'zero' })}>Constant · always 0</button><button aria-pressed={p.oracleId === 'q0'} onClick={() => e.change({ ...p, oracleId: 'q0' })}>Balanced · return q0</button></div><p><strong>{selectedOracle?.category === 'constant' ? 'Constant' : 'Balanced'}:</strong> {selectedOracle?.category === 'constant' ? 'every input returns the same output.' : 'exactly half the inputs return 0 and half return 1.'}</p></fieldset></>
          : <><fieldset className="algorithm-marked"><legend>Marked item · q{n - 1}{n === 2 ? 'q0' : ''} order</legend><div role="group" aria-label="Marked item">{Array.from({ length: 2 ** n }, (_, i) => i.toString(2).padStart(n, '0')).map(item => <button key={item} aria-label={`Mark item ${item}`} aria-pressed={p.markedItem === item} onClick={() => e.change({ ...p, markedItem: item })}><code>{item}</code><small>{p.markedItem === item ? 'Marked' : 'Item'}</small></button>)}</div></fieldset>
            <label>Grover iterations<select aria-label="Grover iterations" value={p.iterations} onChange={event => e.change({ ...p, iterations: Number(event.target.value) })}>{[0, 1, 2, 3, 4].map(k => <option key={k} value={k}>{k === 0 ? '0 · Uniform state only' : `${k} · Oracle + diffuser ${k === 1 ? 'once' : `${k} times`}`}</option>)}</select></label></>}
        <label>Shots · repeated measurements<select aria-label="Algorithm shots" value={p.shots} onChange={event => e.change({ ...p, shots: Number(event.target.value) })}>{[128, 1024, 8192].map(shots => <option key={shots} value={shots}>{shots.toLocaleString()} shots</option>)}</select></label>
        <p className="q-muted">Each shot prepares, runs, and measures the circuit once. {p.seedSimulator === null ? 'The simulator chooses a fresh seed for each run.' : `Reproducible seed: ${p.seedSimulator}.`} Changing any selection clears previous results and predictions.</p>
      </div>{selectedOracle ? <ClassicalOracle key={`${n}:${selectedOracle.id}`} oracle={selectedOracle} /> : <div className="algorithm-search-note"><h3>One check, made reversible.</h3><p>The phase oracle leaves item labels in place and reverses only the marked amplitude. X gates temporarily map zero bits to ones; Z for one qubit or controlled-Z (CZ) for two qubits performs the phase flip; X gates undo the temporary mapping.</p><p>The <strong>diffuser</strong> uses H gates around an all-zero phase flip to reflect amplitudes. Both operations are decomposed into the gates you can inspect below.</p><p>{n === 1 ? 'Two items are a useful boundary case: these standard iterations leave success at 50%.' : 'Try this sequence: run 0 iterations, then 1, then 2. Keep the marked item the same and compare the observed probability.'}</p></div>}</div>
      {e.invalidated && <p className="algorithm-notice" role="status">Selections changed. Previous results and intermediate states were cleared. Make a new prediction and run this configuration.</p>}
      {e.building && <p role="status" className="algorithm-notice">Building the selected circuit…</p>}
      {e.buildError && <div role="alert" className="algorithm-error"><p>{e.buildError}</p><button onClick={e.retryBuild}>Retry circuit preview</button></div>}
      {e.definition && !e.building && <><ol className="algorithm-stage-overview" aria-label="Algorithm circuit stages">{e.definition.stages.map(s => <li key={s.id}><strong>{s.title}</strong><p>{s.description}</p><small>{s.startStep === s.endStep ? `Identity at step ${s.endStep} · no gates` : `Gates ${s.startStep + 1}–${s.endStep}`}</small></li>)}</ol>
        <p className="algorithm-register-note">{dj ? `Inputs: ${e.definition.inputRegister.map(q => `q${q}`).join(', ')}. Helper: q${e.definition.ancillaQubit}. Read only the input register to classify the function.` : `All ${n} qubits hold the search item. There is no helper.`} Full bit order: <code>q[n-1]...q[0]</code>; q0 is rightmost.</p>
        <div className="lab algorithm-lab-embed algorithm-circuit"><CircuitCanvas request={e.definition.circuit} readOnly selectedId={null} tool="h" pending={null} dragTool={null} traceStep={null} onCell={nothing} onSelect={nothing} onCancel={nothing} onDeselect={nothing} onDrop={nothing} /></div>
        <div className="algorithm-lab-link"><p>Experiment with individual gates in a separate Lab draft. Your free circuit and its Undo history are preserved.</p><button className="q-button q-button-secondary" onClick={() => navigate(openAlgorithmWorkspace(e.definition!))}>Open a copy in Circuit Lab ↗</button></div></>}
    </section>
    <section className="algorithm-predict" aria-label="Predict and run"><div className="algorithm-section-label"><span>03</span><h2>Predict. Then put it to the test.</h2></div>
      <QuestionCard key={parameterKey(p)} question={options} prediction submitted={e.prediction} onSubmit={e.predict} />
      <div className="algorithm-run-strip"><button className="q-button q-button-primary" disabled={!e.definition || e.building || e.loading || e.prediction === undefined} onClick={() => void e.run()}>{e.loading ? `Running with ${p.backend === 'pennylane' ? 'PennyLane' : 'Qiskit'}…` : 'Run algorithm'} <span aria-hidden="true">▶</span></button><p>{e.prediction === undefined ? 'Record a prediction first. “I’m not sure” is a valid starting point.' : `Runs the circuit in ${simulatorLabels[p.backend ?? 'qiskit']} and records the state after every gate.`}</p></div>
      {e.loading && <p role="status" className="algorithm-notice">Executing this circuit and tracing every gate…</p>}
      {e.runError && <div role="alert" className="algorithm-error"><p>{e.runError}</p><p>No previous results are shown. Use Run algorithm to retry.</p></div>}
    </section>
    {e.result ? <><div className="algorithm-prediction-comparison"><strong>Your prediction:</strong> {options.options[e.prediction ?? 0]}. <span>Compare it with the observed conclusion below.</span></div><AlgorithmResults key={resultKey} result={e.result} />{dj && <section className="algorithm-next-step" aria-label="Continue to a verified challenge"><div><p className="q-eyebrow">NEXT · APPLY THE SAME IDEA</p><h2>Can you make interference bring a state back?</h2><p>The “Bring it back” challenge starts with a prepared superposition. Build the operation that recombines it to |0⟩, submit it for authoritative grading, and see the verified completion appear in Progress.</p></div><ActionLink href="/challenges/interference">Continue to verified challenge</ActionLink></section>}</>
      : <section id="inspect" className="algorithm-awaiting"><h2>Your experiment’s evidence will appear here.</h2><p>Run the circuit to reveal its ideal probabilities, sampled counts, and every intermediate state.</p></section>}
    <section id="understanding" className="algorithm-understanding"><div className="algorithm-section-label"><span>05</span><h2>Make the idea stick.</h2></div><QuestionCard question={checks[entry.id]} submitted={e.submittedAnswer} onSubmit={e.answer} /><p className="q-muted">This check is practice. Algorithm answers and results stay in memory during navigation; selections and Lab drafts survive reload in this tab. These experiments do not award foundation or challenge progress.</p></section>
    <footer className="q-page-footer"><Link href={`/algorithms/${dj ? 'grover' : 'deutsch-jozsa'}`} className="q-text-link">Explore {dj ? 'Grover’s search' : 'Deutsch–Jozsa'} <span aria-hidden="true">→</span></Link><Link href="/learn" className="q-text-link">Revisit the foundations</Link></footer>
  </main>;
}

export default function Algorithms({ id }: { id?: string }) {
  if (id === 'vqe' || id === 'qaoa') return <Variational key={id} id={id} />;
  return <CircuitAlgorithms id={id} />;
}

function CircuitAlgorithms({ id }: { id?: string }) {
  const { catalog, error, retry } = useAlgorithmCatalog();
  if (id && id !== 'deutsch-jozsa' && id !== 'grover') return <main className="q-page"><PageHeading eyebrow="ALGORITHM EXPLORER" title="That algorithm is not in this collection.">Deutsch–Jozsa, Grover, VQE and QAOA are available.</PageHeading><ActionLink href="/algorithms">Back to algorithms</ActionLink></main>;
  if (id && catalog) return <Experiment entry={catalog.find(a => a.id === id)!} />;
  return <main className="q-page algorithm-catalog"><PageHeading eyebrow="FROM FIRST PRINCIPLES TO REAL CIRCUITS" title="Algorithms, built on understanding.">From interference to hybrid optimization. Choose a problem, predict an outcome, and follow what the quantum state actually does.</PageHeading>
    {error ? <section className="algorithm-error" role="alert"><h2>Algorithms could not load</h2><p>{error}</p><button onClick={retry}>Retry loading algorithms</button></section> : !catalog ? <p role="status">Loading the algorithm catalog…</p> : <>
      <div className="algorithm-catalog-intro"><span>01 / UNDERSTAND</span><span>02 / EXPERIMENT</span><span>03 / INSPECT</span><p>Small enough to follow every gate.<br />Real enough to test your intuition.</p></div>
      <div className="algorithm-catalog-list">{catalog.map((entry, index) => <article key={entry.id} className="algorithm-catalog-entry"><div className="algorithm-catalog-art"><span className="algorithm-number">0{index + 1}</span><AlgorithmMotif id={entry.id} /><p>{entry.id === 'deutsch-jozsa' ? 'INFORMATION THROUGH INTERFERENCE' : 'SEARCH THROUGH AMPLIFICATION'}</p></div><div className="algorithm-catalog-copy"><div className="q-inline-meta"><Badge tone="success">Available</Badge><span>{entry.id === 'deutsch-jozsa' ? 'One oracle query · 2–3 total qubits' : 'One marked item · 1–2 qubits'}</span></div><h2>{entry.title}</h2><p>{entry.summary}</p><p>{entry.id === 'deutsch-jozsa' ? 'Is a hidden rule always the same, or does it split its answers evenly? Learn how a helper qubit and interference reveal the distinction.' : 'How can a sign change make a search succeed? Mark an item, apply the diffuser, and find out why knowing when to stop matters.'}</p><ActionLink href={`/algorithms/${entry.id}`}>Explore {entry.title}</ActionLink></div></article>)}</div>
      <div className="algorithm-catalog-list">{(['vqe', 'qaoa'] as const).map((algorithm, index) => <article key={algorithm} className="algorithm-catalog-entry"><div className="algorithm-catalog-art"><span className="algorithm-number">0{index + 3}</span><p>{algorithm === 'vqe' ? 'ENERGY THROUGH VARIATION' : 'CUTS THROUGH OPTIMIZATION'}</p></div><div className="algorithm-catalog-copy"><div className="q-inline-meta"><Badge tone="blue">Experimental</Badge><span>Longer-running local hybrid optimization · Both simulators</span></div><h2>{algorithm.toUpperCase()}</h2><p>{algorithm === 'vqe' ? 'Tune an entangling two-spin circuit to lower its energy. Compare real state expectations and convergence against exact diagonalization.' : 'Divide a small graph into two groups. Tune cost and mixer layers, inspect real cut probabilities, and compare with classical enumeration.'}</p><ActionLink href={`/algorithms/${algorithm}`}>Explore {algorithm.toUpperCase()}</ActionLink></div></article>)}</div>
      <aside className="algorithm-catalog-foundations"><div><h2>New to qubits? You belong here.</h2><p>Each module introduces its own terms. The foundation lessons give you more time with measurement, superposition, phase, and entanglement.</p></div><ActionLink secondary href="/learn">Explore foundations</ActionLink></aside>
      <footer className="q-page-footer"><span>Local ideal simulation · No AI key needed</span><span>Two guided circuit algorithms · Two hybrid experiments · No quantum hardware</span></footer>
    </>}
  </main>;
}
