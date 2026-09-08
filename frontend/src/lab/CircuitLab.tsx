import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gate, SimulationRequest, SimulationResponse } from '../api/types';
import { simulateCircuit } from '../api/client';
import { templates } from '../templates';
import CircuitCanvas from './CircuitCanvas';
import GatePanel, { GateForm } from './GatePanel';
import GateInspector from './GateInspector';
import ResultsPanel from './ResultsPanel';
import StateExplorer from './StateExplorer';
import BlochSphere from './BlochSphere';
import { useStateTrace } from './useStateTrace';
import { circuitKey, useCircuitEditor } from './useCircuitEditor';
import LessonLabGuide from '../lesson/LessonLabGuide';
import { lessonCircuit, updateLesson } from '../lesson/lessonState';
import FoundationLabGuide from '../lesson/foundations/FoundationLabGuide';
import { blankExperiment, foundationCircuit, updateFoundation } from '../lesson/foundations/state';
import { getExperiment } from '../lesson/foundations/content';
import { Link } from '../app/navigation';
import { foundationWorkspace, rememberWorkspace, type WorkspaceExperiment } from '../app/workspace';
import './lab.css';
import './explorer.css';
import { useTutorLabContext } from '../tutor/TutorProvider';
import type { Challenge } from '../challenges/types';
import { ChallengeBrief, ChallengeGrading } from '../challenges/ChallengeGuide';

export default function CircuitLab({ experiment = null, initialExploring = false, challenge, nextChallenge }: { experiment?: WorkspaceExperiment | null; initialExploring?: boolean; challenge?: Challenge; nextChallenge?: Challenge }) {
  const guided = foundationWorkspace(experiment);
  const legacy = experiment === 'h' || experiment === 'hh' ? experiment : null;
  const [initialRequest] = useState(() => challenge?.startingCircuit ?? (guided ? foundationCircuit(guided.id, guided.experiment) : legacy ? lessonCircuit(legacy) : undefined));
  const { request, error: editError, dispatch, canUndo, canRedo } = useCircuitEditor(initialRequest, challenge ? `challenge:${challenge.id}` : experiment ?? 'free', !!challenge);
  const trace = useStateTrace(request);
  const [exploring, setExploring] = useState(initialExploring);
  const [explorerPane, setExplorerPane] = useState<'joint' | 'qubit'>('joint');
  const [tool, setTool] = useState<Gate['type']>('h');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragTool, setDragTool] = useState<Gate['type'] | null>(null);
  const [pendingCX, setPendingCX] = useState<{ control: number; index: number } | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [shotsPending, setShotsPending] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('circuit');
  const [result, setResult] = useState<{ request: SimulationRequest; response: SimulationResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const workspace = useRef<HTMLElement | null>(null);
  const selected = request.gates.find((gate) => gate.id === selectedId);
  const stale = result !== null && circuitKey(request) !== circuitKey(result.request);
  const status = error ? 'Error' : result ? stale ? 'Stale' : 'Current' : 'Idle';
  const traceStatus = trace.loading ? 'Tracing' : trace.error ? 'Error' : trace.stale || trace.cancelled ? 'Stale' : trace.step ? 'Current' : 'Idle';
  const applyTutorCircuit = useCallback((next: SimulationRequest) => {
    dispatch({ type: 'replace', request: next }); setSelectedId(null); setPendingCX(null); setPlacementError(null);
  }, [dispatch]);
  useTutorLabContext({ circuit: request, selectedStep: exploring && trace.step ? trace.step.index : null,
    lessonId: guided?.id ?? (legacy ? 'superposition' : null), apply: applyTutorCircuit });

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => { if (!challenge) rememberWorkspace(experiment); }, [experiment, challenge]);
  useEffect(() => { setExploring(initialExploring); setMobilePanel('circuit'); }, [initialExploring]);
  useEffect(() => {
    const foundation = foundationWorkspace(experiment);
    if (foundation) updateFoundation(foundation.id, (s) => ({ ...s, drafts: { ...s.drafts, [foundation.experiment]: request } }));
    else if (experiment === 'h' || experiment === 'hh') updateLesson((s) => ({ ...s, drafts: { ...s.drafts, [experiment]: request } }));
  }, [experiment, request]);
  // Pending placement belongs to a particular circuit revision, never an undone one.
  useEffect(() => { setPendingCX(null); setPlacementError(null); }, [request]);

  function chooseTool(next: Gate['type']) {
    setExploring(false);
    setTool(next); setSelectedId(null); setPendingCX(null); setPlacementError(null);
  }
  function addGate(gate: Gate, index: number) {
    setExploring(false);
    dispatch({ type: 'insert', gate, index }); setSelectedId(gate.id); setPendingCX(null); setMobilePanel('circuit');
  }
  function deselect() {
    setSelectedId(null); setPendingCX(null); setPlacementError(null);
    workspace.current?.querySelector<HTMLElement>('.circuit-scroll')?.focus();
  }
  function drop(type: Gate['type'], qubit: number, index: number) {
    chooseTool(type); setDragTool(null);
    if (type === 'cx') {
      if (request.numQubits < 2) return;
      setPendingCX({ control: qubit, index });
    } else {
      addGate({ id: crypto.randomUUID(), type, targets: [qubit], controls: [] }, index);
    }
  }
  function cell(qubit: number, index: number) {
    setPlacementError(null);
    if (tool !== 'cx') {
      addGate({ id: crypto.randomUUID(), type: tool, targets: [qubit], controls: [] }, index);
    } else if (request.numQubits < 2) {
      setPlacementError('CX needs at least two qubits. Add a qubit first.');
    } else if (!pendingCX) {
      setSelectedId(null); setPendingCX({ control: qubit, index });
    } else if (pendingCX.control === qubit || pendingCX.index !== index) {
      setPlacementError('Choose a different target qubit in the same step as the control.');
    } else {
      addGate({ id: crypto.randomUUID(), type: 'cx', controls: [pendingCX.control], targets: [qubit] }, index);
    }
  }
  async function run() {
    if (active.current || shotsPending || pendingCX) return;
    const controller = new AbortController();
    active.current = controller;
    const snapshot = structuredClone(request);
    setLoading(true); setError(null);
    try {
      const response = await simulateCircuit(snapshot, controller.signal);
      if (active.current === controller && !controller.signal.aborted) setResult({ request: snapshot, response });
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Simulation failed. Check the backend and retry.');
        setResult(null);
      }
    } finally {
      if (active.current === controller && !controller.signal.aborted) { active.current = null; setLoading(false); }
    }
  }

  return <main className={`lab${challenge ? ' challenge-lab' : ''}`} onKeyDown={(event) => {
    if (event.key === 'Escape' && (selected || pendingCX)) { event.preventDefault(); deselect(); }
  }}>
    {challenge && <ChallengeBrief challenge={challenge} />}
    <header className="lab-toolbar">
      <div><p className="lab-eyebrow">{challenge ? 'YOUR CHALLENGE CIRCUIT' : experiment ? 'GUIDED EXPERIMENT' : 'BUILD · RUN · OBSERVE'}</p>{challenge ? <h2>Circuit Lab</h2> : <h1>Circuit Lab</h1>}</div>
      <span className="lab-status lab-toolbar-status" data-status={(exploring ? traceStatus : status).toLowerCase()} role="status">{exploring ? `Trace ${traceStatus.toLowerCase()}` : status}</span>
      {!challenge && <label className="lab-template-label">Load template<select aria-label="Load template" value="" onChange={(event) => {
        const template = templates.find((item) => item.id === event.target.value);
        if (template) { dispatch({ type: 'replace', request: template.request }); setSelectedId(null); chooseTool('h'); }
      }}><option value="" disabled>Choose a circuit…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>}
      <div className="lab-toolbar-actions">
        <button onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo}>Undo</button>
        <button onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo}>Redo</button>
        <button onClick={() => { dispatch(challenge ? { type: 'replace', request: challenge.startingCircuit } : { type: 'reset' }); setSelectedId(null); chooseTool('h'); }} disabled={challenge ? circuitKey(request) === circuitKey(challenge.startingCircuit) : !request.gates.length && request.numQubits === 2 && request.shots === 1024}>{challenge ? 'Reset challenge' : 'Reset'}</button>
        <button onClick={() => { setExploring(true); setSelectedId(null); setMobilePanel('circuit'); void trace.run(); }} disabled={trace.loading || shotsPending || pendingCX !== null}>Explore steps</button>
        <button className="lab-primary" onClick={() => { void run(); setExploring(false); setMobilePanel('results'); }} disabled={loading || shotsPending || pendingCX !== null} aria-label="Run Simulation">{loading ? 'Running…' : 'Run Simulation'} <span aria-hidden="true">▶</span></button>
      </div>
      {!challenge && <Link className="lab-lesson-link" href={guided ? `/learn/${guided.id}` : '/learn/superposition'}>{experiment ? 'Return to lesson' : 'Learn: Superposition'}</Link>}
    </header>
    <nav className="lab-mobile-nav" aria-label="Workspace panels">
      {(['settings', 'circuit', 'results'] as const).map((panel) => <button key={panel} aria-pressed={mobilePanel === panel} data-active={mobilePanel === panel} onClick={() => { setMobilePanel(panel); if (panel !== 'circuit') setExploring(false); }}>{panel === 'settings' ? 'Gates & settings' : panel === 'circuit' ? 'Circuit' : 'Results'}</button>)}
    </nav>
    <div className="lab-layout" data-mobile-panel={mobilePanel} data-exploring={exploring} data-explorer-pane={explorerPane}>
      <aside className="lab-settings lab-panel" aria-label="Gates and settings">
        <GatePanel request={request} tool={tool} selected={selected} onTool={chooseTool}
          onQubits={(count) => { dispatch({ type: 'qubits', count }); if (count === 1) chooseTool('h'); }}
          onShots={(shots) => dispatch({ type: 'shots', shots })} onShotsPending={setShotsPending}
          onDrag={setDragTool} />
      </aside>
      <section className="lab-workspace" ref={workspace}>
        {legacy && <LessonLabGuide experiment={legacy} request={request} result={result} trace={trace} exploring={exploring}
          busy={loading || trace.loading || shotsPending || pendingCX !== null} failed={error !== null}
          onReset={() => { dispatch({ type: 'replace', request: { numQubits: 1, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42 } }); chooseTool('h'); }} />}
        {guided && <FoundationLabGuide id={guided.id} experimentId={guided.experiment} request={request} result={result} trace={trace} exploring={exploring}
          busy={loading || trace.loading || shotsPending || pendingCX !== null} failed={error !== null}
          onReset={() => { dispatch({ type: 'replace', request: blankExperiment(getExperiment(guided.id, guided.experiment)!) }); chooseTool('h'); }} />}
        <div className="workspace-modes" aria-label="Workspace mode">
          <button aria-pressed={!exploring} onClick={() => setExploring(false)}>Circuit editor</button>
          <button aria-pressed={exploring} onClick={() => { setExploring(true); setSelectedId(null); }}>State Explorer</button>
        </div>
        {(editError || placementError) && <p role="alert" className="lab-notice">{placementError ?? editError}</p>}
        <CircuitCanvas request={request} selectedId={selected?.id ?? null} tool={tool} pendingCX={pendingCX} onCell={cell} dragTool={dragTool} onDrop={drop}
          emptyHint={guided ? guided.experiment === 'empty' ? 'No gates needed for this baseline. Run Simulation, then Explore steps.' : 'Empty circuit · follow your experiment guide to place the first gate.' : undefined}
          traceStep={exploring ? trace.step : null}
          onSelect={(id) => { setExploring(false); setSelectedId(id); setPendingCX(null); setPlacementError(null); }} onDeselect={deselect} onCancel={() => { setPendingCX(null); setPlacementError(null); }} />
        <div hidden={exploring}>
        {selected ? <GateInspector request={request} selected={selected}
          onSave={(gate) => dispatch({ type: 'update', gate })}
          onDelete={() => { dispatch({ type: 'delete', id: selected.id }); deselect(); }}
          onMove={(delta) => dispatch({ type: 'move', id: selected.id, delta })} onDeselect={deselect} />
          : <details className="lab-insertion" key={tool}>
            <summary>Add gate with form</summary>
            <GateForm key={`${tool}:${request.numQubits}:${request.gates.length}`} request={request} selected={undefined} tool={tool} onSave={addGate} />
          </details>}
        <details className="lab-workspace-help"><summary>How to use the circuit</summary>
          <p>Select a gate, then click or tap a + cell. On desktop, you can also drag a gate from the palette to an empty cell. For CX, place the control first, then choose a different target wire at the same step.</p>
          <p>An empty cell inserts before that step; the final column appends. Click an existing gate to edit, reorder, or delete it. Choose Done, a palette tool, or press Escape to return to placement.</p>
          <p>Keyboard: Tab to a palette button or wire cell, then Enter or Space to activate. The form provides direct qubit and insertion-position selection.</p>
          <p>All qubits start in |0⟩ and are measured at the end. Gates execute left to right, one operation per step. Maximum 256 gates.</p>
        </details>
        </div>
        {challenge && <ChallengeGrading challenge={challenge} request={request} blocked={shotsPending || pendingCX !== null} nextChallenge={nextChallenge}
          onSubmitting={() => setSelectedId(null)}
          onInspect={() => { setExploring(true); setSelectedId(null); setMobilePanel('circuit'); void trace.run(); }} />}
        {exploring && <StateExplorer trace={trace} blocked={shotsPending || pendingCX !== null} pane={explorerPane} onPane={setExplorerPane} />}
      </section>
      <aside className="lab-results lab-panel">
        {exploring && <><BlochSphere step={trace.step} beginner={experiment !== null && request.numQubits === 1} /><button className="explorer-final-results" onClick={() => { setExploring(false); setMobilePanel('results'); }}>View final simulation results</button></>}
        <div hidden={exploring}><ResultsPanel request={request} result={result} stale={stale} loading={loading} error={error} /></div>
      </aside>
    </div>
    <footer className="lab-footer"><span>{experiment || challenge ? <Link href="/lab?workspace=free">Open free exploration</Link> : 'Quantum Learning · Circuit Lab'}</span><span>Tab-session draft · last 100 edits undoable</span><a className="lab-test-link" href="/circuit-test">Circuit Test ↗</a></footer>
  </main>;
}
