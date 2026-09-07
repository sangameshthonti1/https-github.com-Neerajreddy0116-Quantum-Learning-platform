import { useEffect, useRef, useState } from 'react';
import type { Gate, SimulationRequest, SimulationResponse } from '../api/types';
import { simulateCircuit } from '../api/client';
import { templates } from '../templates';
import CircuitCanvas from './CircuitCanvas';
import GatePanel, { GateForm } from './GatePanel';
import GateInspector from './GateInspector';
import ResultsPanel from './ResultsPanel';
import { circuitKey, useCircuitEditor } from './useCircuitEditor';
import './lab.css';

export default function CircuitLab() {
  const { request, error: editError, dispatch, canUndo, canRedo } = useCircuitEditor();
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

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  // Pending placement belongs to a particular circuit revision, never an undone one.
  useEffect(() => { setPendingCX(null); setPlacementError(null); }, [request]);

  function chooseTool(next: Gate['type']) {
    setTool(next); setSelectedId(null); setPendingCX(null); setPlacementError(null);
  }
  function addGate(gate: Gate, index: number) {
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

  return <main className="lab" onKeyDown={(event) => {
    if (event.key === 'Escape' && (selected || pendingCX)) { event.preventDefault(); deselect(); }
  }}>
    <header className="lab-toolbar">
      <a className="lab-brand" href="/" aria-label="Circuit Lab home"><span>q</span></a>
      <div><p className="lab-eyebrow">QUANTUM LEARNING</p><h1>Circuit Lab</h1></div>
      <span className="lab-status lab-toolbar-status" data-status={status.toLowerCase()} role="status">{status}</span>
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
          onDrag={setDragTool} />
      </aside>
      <section className="lab-workspace" ref={workspace}>
        {(editError || placementError) && <p role="alert" className="lab-notice">{placementError ?? editError}</p>}
        <CircuitCanvas request={request} selectedId={selected?.id ?? null} tool={tool} pendingCX={pendingCX} onCell={cell} dragTool={dragTool} onDrop={drop}
          onSelect={(id) => { setSelectedId(id); setPendingCX(null); setPlacementError(null); }} onDeselect={deselect} onCancel={() => { setPendingCX(null); setPlacementError(null); }} />
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
      </section>
      <aside className="lab-results lab-panel"><ResultsPanel request={request} result={result} stale={stale} loading={loading} error={error} /></aside>
    </div>
    <footer className="lab-footer"><span>Quantum Learning · Circuit Lab</span><span>Session only · last 100 edits undoable</span></footer>
  </main>;
}
