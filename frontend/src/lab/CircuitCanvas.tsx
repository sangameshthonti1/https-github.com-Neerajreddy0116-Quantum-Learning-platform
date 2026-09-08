import { useEffect, useId, useRef, useState } from 'react';
import type { Gate, SimulationRequest, TraceStep } from '../api/types';
import { angleText, arity, gateDefinitions } from './gates';

export interface PendingPlacement { type: Gate['type']; qubits: number[]; index: number }

export interface CircuitCanvasProps {
  request: SimulationRequest;
  selectedId: string | null;
  tool: Gate['type'];
  pending: PendingPlacement | null;
  onCell: (qubit: number, index: number) => void;
  onSelect: (id: string) => void;
  onCancel: () => void;
  onDeselect: () => void;
  dragTool: Gate['type'] | null;
  onDrop: (type: Gate['type'], qubit: number, index: number) => void;
  traceStep: TraceStep | null;
  emptyHint?: string;
  readOnly?: boolean;
}

export default function CircuitCanvas({
  request, selectedId, tool, pending, onCell, onSelect, onCancel, onDeselect, dragTool, onDrop, traceStep, emptyHint, readOnly = false,
}: CircuitCanvasProps) {
  const instructionsId = useId();
  const [dropCell, setDropCell] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = scroll.current;
    const column = container?.querySelector<HTMLElement>('[data-trace="true"]');
    if (container && column) container.scrollLeft = traceStep?.index === 0 ? 0 : Math.max(0, column.offsetLeft - container.clientWidth / 2);
  }, [traceStep]);
  const qubits = Array.from({ length: request.numQubits }, (_, index) => index);

  return (
    <div className="circuit-canvas" data-readonly={readOnly}>
      <header className="circuit-canvas-header">
        <div>
          <span className="lab-eyebrow">{readOnly ? 'CIRCUIT · REAL QUANTUM OPERATIONS' : 'COMPOSER'}</span>
          <h2>{readOnly ? 'Generated circuit' : 'Circuit workspace'}</h2>
        </div>
        <span className="lab-chip">{request.numQubits} qubits · {request.gates.length} gates</span>
      </header>

      <p id={instructionsId} className="circuit-instructions">
        {readOnly ? 'Read each wire left to right. Connected dots are controls; the target changes only when the control is 1. Open a copy in the Lab to edit these operations.' : traceStep ? `Trace step ${traceStep.index} · ${traceStep.gate ? `after ${traceStep.gate.type.toUpperCase()}` : 'initial all-zero state, before any gate'}. Click a gate to edit the circuit.` : selectedId ? 'Edit the selected gate below, or choose a palette tool to place gates.'
          : arity(tool) > 1 ? `${tool === 'swap' ? 'Choose two different wires' : tool === 'ccx' ? 'Choose two control wires, then the target' : 'Choose the control wire, then a different target'} at the same step.`
          : 'Click a + cell to place a gate. Click an existing gate to edit it.'}
      </p>

      <div className="circuit-mode" data-editing={Boolean(selectedId)}>
        <span className="circuit-tool-badge">{readOnly ? 'PREVIEW' : traceStep ? 'TRACE' : selectedId ? 'EDIT' : tool.toUpperCase()}</span>
        <span>{readOnly ? 'All qubits begin in 0' : traceStep ? `Step ${traceStep.index} · before measurement` : selectedId ? 'Gate selected' : pending ? `Choose ${pending.type.toUpperCase()} wire ${pending.qubits.length + 1} of ${arity(pending.type)}` : `${tool.toUpperCase()} placement tool`}</span>
        {selectedId && <button onClick={onDeselect}>Deselect</button>}
        <span className="circuit-direction">Execution left to right <span aria-hidden="true">→</span></span>
      </div>

      {pending && (
        <div className="lab-notice circuit-pending" role="status">
          <span>
            {pending.type === 'swap' ? 'First wire:' : 'Control:'} <strong>{pending.qubits.map((q) => `q${q}`).join(', ')}</strong>. Choose a different wire
            at <strong>step {pending.index + 1}</strong> for {pending.type.toUpperCase()}.
          </span>
          <button type="button" onClick={onCancel}>Cancel {pending.type.toUpperCase()}</button>
        </div>
      )}

      <div
        className="circuit-scroll"
        ref={scroll}
        role="region"
        aria-label="Circuit grid, execution left to right"
        aria-describedby={instructionsId}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && pending) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="circuit-grid" data-empty={request.gates.length === 0}>
          <div className="circuit-wire-labels" data-trace={traceStep?.index === 0}>
            <div className="circuit-step-label">{traceStep?.index === 0 ? 'Initial · 0' : 'Step'}</div>
            {qubits.map((qubit) => (
              <div key={qubit} className="circuit-wire-label">
                <span>q{qubit}</span><span className="circuit-initial-state">|0⟩</span>
              </div>
            ))}
          </div>
          {Array.from({ length: request.gates.length + (readOnly ? 0 : 1) }, (_, index) => {
            const gate = request.gates[index];
            const selected = gate !== undefined && gate.id === selectedId;
            const pendingColumn = pending?.index === index;
            const wires = gate ? [...gate.controls, ...gate.targets] : [];
            return (
              <div
                key={gate?.id ?? 'append'}
                className="circuit-column"
                data-selected={selected}
                data-pending={pendingColumn}
                data-trace={gate !== undefined && gate.id === traceStep?.gate?.id}
                data-gate-id={gate?.id}
              >
                <div className="circuit-step-label">
                  {index + 1}
                  {!gate && <span className="circuit-append-label">add</span>}
                </div>
                {gate && wires.length > 1 && (
                  <span
                    className="circuit-cx-connector"
                    data-testid={`${gate.type}-connector-${gate.id}`}
                    aria-hidden="true"
                    style={{
                      top: `calc(var(--circuit-step-height) + ( ${Math.min(...wires)} + 0.5 ) * var(--circuit-row-height))`,
                      height: `calc(${Math.max(...wires) - Math.min(...wires)} * var(--circuit-row-height))`,
                    }}
                  />
                )}
                {qubits.map((qubit) => {
                  const isControl = gate && (gate.controls as number[]).includes(qubit);
                  const isTarget = gate && (gate.targets as number[]).includes(qubit);
                  const occupied = gate !== undefined && (isControl || isTarget);
                  const previewControl = pendingColumn && pending?.qubits.includes(qubit);
                  const label = readOnly ? `${gate?.type.toUpperCase()} ${isControl ? 'control' : 'target'} q${qubit} at step ${index + 1}` : occupied
                    ? wires.length > 1
                      ? `Select ${gate.type.toUpperCase()} ${isControl ? 'control' : 'target'} q${qubit} at step ${index + 1}`
                      : `Select ${gate.type.toUpperCase()} gate at step ${index + 1}`
                    : `Place gate on q${qubit} at step ${index + 1}`;
                  return (
                    <div key={qubit} className="circuit-cell" data-preview={previewControl}
                      data-drop-target={dragTool !== null && !occupied && request.gates.length < 256}
                      data-drag-over={dragTool !== null && dropCell === `${index}:${qubit}`}
                      onDragOver={(event) => {
                        if (!dragTool || occupied || request.gates.length >= 256) return;
                        event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
                        setDropCell(`${index}:${qubit}`);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropCell(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault(); setDropCell(null);
                        if (!dragTool || occupied || request.gates.length >= 256) return;
                        if (event.dataTransfer.getData('application/x-quantum-gate') !== dragTool) return;
                        onDrop(dragTool, qubit, index);
                      }}>
                      {(!readOnly || occupied) && <button
                        type="button"
                        disabled={readOnly}
                        className={`circuit-cell-button ${occupied ? 'circuit-gate' : 'circuit-empty-cell'}${isControl ? ' circuit-control' : ''}${isTarget && (gate?.type === 'cx' || gate?.type === 'ccx') ? ' circuit-target' : ''}`}
                        aria-label={label}
                        aria-pressed={occupied ? selected : undefined}
                        title={occupied ? `${label}. ${gateDefinitions[gate.type].description}${gate.params ? ` Angle ${angleText(gate.params[0])} radians.` : ''}` : label}
                        onClick={() => occupied ? onSelect(gate.id) : onCell(qubit, index)}
                      >
                        <span aria-hidden="true">
                          {occupied ? isControl ? '●' : gate.type === 'cx' || gate.type === 'ccx' ? '⊕' : gate.type === 'swap' ? '×' : gate.type === 'cz' ? 'Z' : gateDefinitions[gate.type].label : previewControl ? '●' : '+'}
                        </span>
                      </button>}
                      {occupied && gate.params && <span className="circuit-angle" title={`${gate.params[0]} radians`}>{angleText(gate.params[0]).replaceAll('pi', 'π')}</span>}
                      {previewControl && <span className="circuit-preview-label">{pending?.type === 'swap' ? 'wire' : 'control'}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="circuit-wire-tail" aria-hidden="true">
            <div className="circuit-step-label" />
            {qubits.map((qubit) => <div className="circuit-cell" key={qubit} />)}
          </div>
        </div>
      </div>

      <div className="circuit-caption">
        <span>{request.gates.length === 0 ? emptyHint ?? 'Empty circuit · start with H on q0, or load a template.' : `${request.gates.length} / 256 gates · one operation per step`}</span>
        <span>All qubits measured at the end.</span>
      </div>
    </div>
  );
}
