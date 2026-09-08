import { useEffect, useState } from 'react';
import type { Gate, SimulationRequest } from '../api/types';
import { arity, gateDefinitions, gateGroups, gateTypes, makeGate } from './gates';
import AngleField, { validAngle } from './AngleField';

interface Props {
  request: SimulationRequest;
  tool: Gate['type'];
  selected: Gate | undefined;
  onTool: (type: Gate['type']) => void;
  onQubits: (count: number) => void;
  onShots: (shots: number) => void;
  onShotsPending: (pending: boolean) => void;
  onDrag: (type: Gate['type'] | null) => void;
  angle: string;
  onAngle: (angle: string) => void;
}

interface GateFormProps extends Pick<Props, 'request' | 'selected' | 'tool'> {
  onSave: (gate: Gate, index: number) => void;
  defaultAngle?: string;
}

export function GateForm({ request, selected, tool, onSave, defaultAngle }: GateFormProps) {
  const [type, setType] = useState<Gate['type']>(selected?.type ?? tool);
  const [target, setTarget] = useState(selected?.targets[0] ?? gateDefinitions[tool].controls);
  const [control, setControl] = useState(selected?.controls[0] ?? 0);
  const [secondControl, setSecondControl] = useState(selected?.controls[1] ?? 1);
  const [secondTarget, setSecondTarget] = useState(selected?.targets[1] ?? 1);
  const [angle, setAngle] = useState(String(selected?.params?.[0] ?? defaultAngle ?? Math.PI / 2));
  const [index, setIndex] = useState(request.gates.length);
  const qubits = Array.from({ length: request.numQubits }, (_, q) => q);
  const definition = gateDefinitions[type];
  const operands = [...(definition.controls ? [control] : []), ...(definition.controls === 2 ? [secondControl] : []), target, ...(definition.targets === 2 ? [secondTarget] : [])];
  const invalidQubits = operands.some((q) => q >= request.numQubits) || new Set(operands).size !== arity(type);
  const invalid = invalidQubits || (definition.parameterized && !validAngle(angle));

  return <form className="lab-inspector" onSubmit={(event) => {
    event.preventDefault();
    if (invalid) return;
    const id = selected?.id ?? crypto.randomUUID();
    const gate = makeGate(type, operands, Number(angle), id);
    onSave(gate, index);
  }}>
    <label className="lab-field">Gate type<select aria-label="Gate type" value={type} onChange={(event) => setType(event.target.value as Gate['type'])}>
      {gateTypes.map((value) => <option key={value} value={value} disabled={arity(value) > request.numQubits}>{gateDefinitions[value].label} · {gateDefinitions[value].name}</option>)}
    </select></label>
    {definition.controls > 0 && <label className="lab-field">Control qubit<select aria-label="Control qubit" value={control} onChange={(event) => setControl(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>}
    {definition.controls === 2 && <label className="lab-field">Second control qubit<select aria-label="Second control qubit" value={secondControl} onChange={(event) => setSecondControl(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>}
    <label className="lab-field">Target qubit<select aria-label="Target qubit" value={target} onChange={(event) => setTarget(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>
    {definition.targets === 2 && <label className="lab-field">Second target qubit<select aria-label="Second target qubit" value={secondTarget} onChange={(event) => setSecondTarget(Number(event.target.value))}>
      {qubits.map((q) => <option key={q} value={q}>q{q}</option>)}
    </select></label>}
    {definition.parameterized && <AngleField value={angle} onChange={setAngle} />}
    {!selected && <label className="lab-field">Insert position<select aria-label="Insert position" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
      {Array.from({ length: request.gates.length + 1 }, (_, i) => <option key={i} value={i}>{i === request.gates.length ? 'At end' : `Before step ${i + 1}`}</option>)}
    </select></label>}
    {invalidQubits && <p className="lab-notice" role="status">Choose {arity(type) === 2 ? 'two' : arity(type) === 3 ? 'three' : 'one'} different existing qubits for {definition.label}.</p>}
    {definition.parameterized && !validAngle(angle) && <p className="lab-notice" role="status">Enter a finite angle in radians before applying this gate.</p>}
    <button type="submit" disabled={invalid || (!selected && request.gates.length >= 256)}>{selected ? 'Apply gate changes' : 'Add gate'}</button>
  </form>;
}

export default function GatePanel(props: Props) {
  const { request, tool, selected, onTool, onQubits, onShots, onShotsPending, onDrag, angle, onAngle } = props;
  const [shots, setShots] = useState(String(request.shots));
  useEffect(() => { setShots(String(request.shots)); onShotsPending(false); }, [request.shots, onShotsPending]);
  const lastQubitUsed = request.gates.some((gate) => [...gate.targets, ...gate.controls].includes(request.numQubits - 1));
  const shotsValid = shots.trim() !== '' && Number.isInteger(Number(shots)) && Number(shots) >= 1 && Number(shots) <= 8192;
  const shotsDirty = shots !== String(request.shots);

  return <>
    <section className="lab-section">
      <div className="lab-section-title"><h2>Gate library</h2><span>16 operations</span></div>
      {gateGroups.map((group) => <details className="lab-gate-group" key={group} open><summary>{group}</summary><div className="lab-gate-palette">
        {gateTypes.filter((value) => gateDefinitions[value].group === group).map((value) => <button key={value} aria-label={`Choose ${value.toUpperCase()} gate`} aria-pressed={!selected && tool === value} disabled={arity(value) > request.numQubits}
          title={`${gateDefinitions[value].description}${arity(value) > request.numQubits ? ` Add qubits: needs ${arity(value)}.` : ''}`}
          draggable={arity(value) <= request.numQubits}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-quantum-gate', value);
            event.dataTransfer.effectAllowed = 'copy';
            onDrag(value as Gate['type']);
          }} onDragEnd={() => onDrag(null)} onClick={() => onTool(value as Gate['type'])}>
          <strong>{gateDefinitions[value].label}</strong><span>{gateDefinitions[value].name}</span>
        </button>)}
      </div></details>)}
      <p className="lab-muted lab-palette-hint">Select a gate and tap a + cell, or drag it onto a wire.</p>
      {gateDefinitions[tool].parameterized && !selected && <AngleField value={angle} onChange={onAngle} />}
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
