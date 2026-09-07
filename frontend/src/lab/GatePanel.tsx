import { useEffect, useState } from 'react';
import type { Gate, SimulationRequest } from '../api/types';

interface Props {
  request: SimulationRequest;
  tool: Gate['type'];
  selected: Gate | undefined;
  onTool: (type: Gate['type']) => void;
  onQubits: (count: number) => void;
  onShots: (shots: number) => void;
  onShotsPending: (pending: boolean) => void;
  onDrag: (type: Gate['type'] | null) => void;
}

const gateNames = { h: 'Hadamard', x: 'Pauli X', z: 'Pauli Z', cx: 'Controlled X' };

interface GateFormProps extends Pick<Props, 'request' | 'selected' | 'tool'> {
  onSave: (gate: Gate, index: number) => void;
}

export function GateForm({ request, selected, tool, onSave }: GateFormProps) {
  const [type, setType] = useState<Gate['type']>(selected?.type ?? tool);
  const [target, setTarget] = useState(selected?.targets[0] ?? (tool === 'cx' ? 1 : 0));
  const [control, setControl] = useState(selected?.controls[0] ?? 0);
  const [index, setIndex] = useState(request.gates.length);
  const qubits = Array.from({ length: request.numQubits }, (_, q) => q);
  const invalid = target >= request.numQubits || (type === 'cx' && (control === target || control >= request.numQubits));

  return <form className="lab-inspector" onSubmit={(event) => {
    event.preventDefault();
    if (invalid) return;
    const id = selected?.id ?? crypto.randomUUID();
    const gate: Gate = type === 'cx'
      ? { id, type, targets: [target], controls: [control] }
      : { id, type, targets: [target], controls: [] };
    onSave(gate, index);
  }}>
    <label className="lab-field">Gate type<select aria-label="Gate type" value={type} onChange={(event) => setType(event.target.value as Gate['type'])}>
      {Object.entries(gateNames).map(([value, name]) => <option key={value} value={value} disabled={value === 'cx' && request.numQubits < 2}>{value.toUpperCase()} · {name}</option>)}
    </select></label>
    {type === 'cx' && <label className="lab-field">Control qubit<select aria-label="Control qubit" value={control} onChange={(event) => setControl(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>}
    <label className="lab-field">Target qubit<select aria-label="Target qubit" value={target} onChange={(event) => setTarget(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>
    {!selected && <label className="lab-field">Insert position<select aria-label="Insert position" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
      {Array.from({ length: request.gates.length + 1 }, (_, i) => <option key={i} value={i}>{i === request.gates.length ? 'At end' : `Before step ${i + 1}`}</option>)}
    </select></label>}
    {invalid && <p className="lab-notice" role="status">Choose two different existing qubits for CX.</p>}
    <button type="submit" disabled={invalid || (!selected && request.gates.length >= 256)}>{selected ? 'Apply gate changes' : 'Add gate'}</button>
  </form>;
}

export default function GatePanel(props: Props) {
  const { request, tool, selected, onTool, onQubits, onShots, onShotsPending, onDrag } = props;
  const [shots, setShots] = useState(String(request.shots));
  useEffect(() => { setShots(String(request.shots)); onShotsPending(false); }, [request.shots, onShotsPending]);
  const lastQubitUsed = request.gates.some((gate) => [...gate.targets, ...gate.controls].includes(request.numQubits - 1));
  const shotsValid = shots.trim() !== '' && Number.isInteger(Number(shots)) && Number(shots) >= 1 && Number(shots) <= 8192;
  const shotsDirty = shots !== String(request.shots);

  return <>
    <section className="lab-section">
      <div className="lab-section-title"><h2>Gate library</h2><span>4 operations</span></div>
      <div className="lab-gate-palette">
        {Object.entries(gateNames).map(([value, name]) => <button key={value} aria-label={`Choose ${value.toUpperCase()} gate`} aria-pressed={!selected && tool === value} disabled={value === 'cx' && request.numQubits < 2}
          draggable={value !== 'cx' || request.numQubits >= 2}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-quantum-gate', value);
            event.dataTransfer.effectAllowed = 'copy';
            onDrag(value as Gate['type']);
          }} onDragEnd={() => onDrag(null)} onClick={() => onTool(value as Gate['type'])}>
          <strong>{value.toUpperCase()}</strong><span>{name}</span>
        </button>)}
      </div>
      <p className="lab-muted lab-palette-hint">Select a gate and tap a + cell, or drag it onto a wire.</p>
    </section>
    <section className="lab-section">
      <h2>Circuit settings</h2>
      <div className="lab-settings-fields">
      <div className="lab-qubits"><span className="lab-setting-label">Qubits</span><div className="lab-actions"><span>{request.numQubits} qubits</span>
        <button aria-label="Remove qubit" disabled={request.numQubits === 1 || lastQubitUsed} onClick={() => onQubits(request.numQubits - 1)}>−</button>
        <button aria-label="Add qubit" disabled={request.numQubits === 3} onClick={() => onQubits(request.numQubits + 1)}>+</button>
      </div></div>
      {lastQubitUsed && request.numQubits > 1 && <p className="lab-muted">To remove q{request.numQubits - 1}, first move or delete its gates.</p>}
      <form className="lab-shots" onSubmit={(event) => { event.preventDefault(); if (shotsValid) { onShots(Number(shots)); setShots(String(Number(shots))); onShotsPending(false); } }}>
        <label className="lab-field">Shots<input type="number" min="1" max="8192" step="1" required value={shots} aria-invalid={!shotsValid} onChange={(event) => {
          setShots(event.target.value); onShotsPending(event.target.value !== String(request.shots));
        }} /></label>
        <button type="submit" disabled={!shotsValid || !shotsDirty}>Apply shots</button>
        {shotsDirty && <p className="lab-muted">Apply a whole number from 1–8192 before running.</p>}
      </form>
      <label className="lab-field lab-simulator">Simulator<select aria-label="Simulator" value="qiskit" disabled><option value="qiskit">Qiskit Aer · local</option></select></label>
      </div>
    </section>
  </>;
}
