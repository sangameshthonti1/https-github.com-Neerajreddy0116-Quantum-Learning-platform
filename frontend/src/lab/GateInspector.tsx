import type { Gate, SimulationRequest } from '../api/types';
import { GateForm } from './GatePanel';

interface Props {
  request: SimulationRequest;
  selected: Gate;
  onSave: (gate: Gate) => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onDeselect: () => void;
}

export default function GateInspector({ request, selected, onSave, onDelete, onMove, onDeselect }: Props) {
  const index = request.gates.findIndex((gate) => gate.id === selected.id);
  return <section className="lab-context-inspector" aria-label="Selected gate inspector">
    <header className="lab-inspector-heading">
      <div><h2>Selected gate</h2><p>Step {index + 1} · {selected.type.toUpperCase()}</p></div>
      <button onClick={onDeselect}>Done · place gates</button>
    </header>
    <GateForm key={`${JSON.stringify(selected)}:${request.numQubits}`} request={request} selected={selected} tool={selected.type} onSave={onSave} />
    <div className="lab-inspector-footer">
      <div className="lab-actions" aria-label="Gate order">
        <button aria-label="Move gate earlier" disabled={index <= 0} onClick={() => onMove(-1)}>← Earlier</button>
        <button aria-label="Move gate later" disabled={index >= request.gates.length - 1} onClick={() => onMove(1)}>Later →</button>
      </div>
      <button className="lab-danger" onClick={onDelete}>Delete gate</button>
    </div>
    <p className="lab-muted">Apply to save changes. Escape closes the inspector.</p>
  </section>;
}
