import { useEffect, useRef, useState } from 'react';
import type { Gate, SimulationRequest, SimulationResponse } from '../api/types';
import { simulateCircuit } from '../api/client';
import { templates } from '../templates';
import CircuitCanvas from './CircuitCanvas';
import GatePanel from './GatePanel';
import ResultsPanel from './ResultsPanel';
import { circuitKey, useCircuitEditor } from './useCircuitEditor';
import './lab.css';

export default function CircuitLab() {
  const { request, error: editError, dispatch, canUndo, canRedo } = useCircuitEditor();
  const [tool, setTool] = useState<Gate['type']>('h');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingCX, setPendingCX] = useState<{ control: number; index: number } | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [shotsPending, setShotsPending] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('circuit');
  const [result, setResult] = useState<{ request: SimulationRequest; response: SimulationResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const selected = request.gates.find((gate) => gate.id === selectedId);
  const stale = result !== null && circuitKey(request) !== circuitKey(result.request);

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  // Pending placement belongs to a particular circuit revision, never an undone one.
  useEffect(() => { setPendingCX(null); setPlacementError(null); }, [request]);

  function chooseTool(next: Gate['type']) {
    setTool(next); setSelectedId(null); setPendingCX(null); setPlacementError(null);
  }
  function addGate(gate: Gate, index: number) {
    dispatch({ type: 'insert', gate, index }); setSelectedId(gate.id); setPendingCX(null);
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

  return <main className="lab">
    <header className="lab-toolbar">
      <a className="lab-brand" href="/" aria-label="Circuit Lab home"><span>q</span></a>
      <div><p className="lab-eyebrow">QUANTUM LEARNING</p><h1>Circuit Lab</h1></div>
      <span className="lab-chip">Qiskit Aer · local</span>
      <label className="lab-template-label">Load template<select aria-label="Load template" value="" onChange={(event) => {
        const template = templates.find((item) => item.id === event.target.value);
        if (template) { dispatch({ type: 'replace', request: template.request }); setSelectedId(null); chooseTool('h'); }
      }}><option value="" disabled>Choose a circuit…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
      <div className="lab-toolbar-actions">
        <button onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo}>Undo</button>
        <button onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo}>Redo</button>
        <button onClick={() => { dispatch({ type: 'reset' }); setSelectedId(null); chooseTool('h'); }} disabled={!request.gates.length && request.numQubits === 2 && request.shots === 1024}>Reset</button>
        <button className="lab-primary" onClick={() => { void run(); setMobilePanel('results'); }} disabled={loading || shotsPending || pendingCX !== null} aria-label="Run Simulation">{loading ? 'Running…' : 'Run Simulation'} <span aria-hidden="true">▶</span></button>
      </div>
      <a className="lab-test-link" href="/circuit-test">Circuit Test ↗</a>
    </header>
    <nav className="lab-mobile-nav" aria-label="Workspace panels">
      {(['settings', 'circuit', 'results'] as const).map((panel) => <button key={panel} aria-pressed={mobilePanel === panel} data-active={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{panel === 'settings' ? 'Gates & settings' : panel === 'circuit' ? 'Circuit' : 'Results'}</button>)}
    </nav>
    <div className="lab-layout" data-mobile-panel={mobilePanel}>
      <aside className="lab-settings lab-panel" aria-label="Gates and settings">
        <GatePanel request={request} tool={tool} selected={selected} onTool={chooseTool}
          onQubits={(count) => { dispatch({ type: 'qubits', count }); if (count === 1) chooseTool('h'); }}
          onShots={(shots) => dispatch({ type: 'shots', shots })} onShotsPending={setShotsPending}
          onSave={(gate, index) => { if (selected) dispatch({ type: 'update', gate }); else addGate(gate, index); }}
          onDelete={() => { if (selected) dispatch({ type: 'delete', id: selected.id }); setSelectedId(null); }}
          onMove={(delta) => { if (selected) dispatch({ type: 'move', id: selected.id, delta }); }} onDeselect={() => setSelectedId(null)} />
      </aside>
      <section className="lab-workspace">
        {(editError || placementError) && <p role="alert" className="lab-notice">{placementError ?? editError}</p>}
        <CircuitCanvas request={request} selectedId={selected?.id ?? null} tool={tool} pendingCX={pendingCX} onCell={cell}
          onSelect={(id) => { setSelectedId(id); setPendingCX(null); setMobilePanel('settings'); }} onCancel={() => { setPendingCX(null); setPlacementError(null); }} />
        <div className="lab-canvas-footer"><span>{request.gates.length} / 256 gates</span><span>{request.numQubits} qubits · {request.shots.toLocaleString()} shots</span><span>q0 = least-significant bit</span></div>
        <section className="lab-workspace-note"><h2>Build. Run. Observe.</h2><p>Gates execute left to right, one operation per column. Click a gate to edit or reorder it. Empty cells insert before that column; the final column appends.</p><p>All qubits start in |0⟩. The simulator measures every qubit only at the end.</p></section>
      </section>
      <aside className="lab-results lab-panel"><ResultsPanel request={request} result={result} stale={stale} loading={loading} error={error} /></aside>
    </div>
    <footer className="lab-footer"><span>H · X · Z · CX</span><span>Undo history: last 100 edits · session only</span><span>Real simulation. No mock results.</span></footer>
  </main>;
}
