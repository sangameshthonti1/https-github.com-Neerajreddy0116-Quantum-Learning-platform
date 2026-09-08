import { useLayoutEffect, useReducer } from 'react';
import type { Gate, SimulationRequest } from '../api/types';

export const emptyCircuit = (): SimulationRequest => ({
  numQubits: 2, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42,
});

/** Compare request meaning without treating object property insertion order as an edit. */
export function circuitKey(request: SimulationRequest): string {
  return JSON.stringify({
    numQubits: request.numQubits,
    shots: request.shots,
    backend: request.backend,
    seedSimulator: request.seedSimulator ?? null,
    gates: request.gates.map(({ id, type, targets, controls }) => ({ id, type, targets, controls })),
  });
}

interface History {
  past: SimulationRequest[];
  present: SimulationRequest;
  future: SimulationRequest[];
  error: string | null;
}

type Edit =
  | { type: 'replace'; request: SimulationRequest }
  | { type: 'insert'; gate: Gate; index: number }
  | { type: 'update'; gate: Gate }
  | { type: 'delete'; id: string }
  | { type: 'move'; id: string; delta: -1 | 1 }
  | { type: 'qubits'; count: number }
  | { type: 'shots'; shots: number }
  | { type: 'undo' | 'redo' | 'reset' };

function validate(request: SimulationRequest): string | null {
  if (!Number.isInteger(request.numQubits) || request.numQubits < 1 || request.numQubits > 3) return 'Use between 1 and 3 qubits.';
  if (!Number.isInteger(request.shots) || request.shots < 1 || request.shots > 8192) return 'Shots must be an integer between 1 and 8192.';
  if (request.gates.length > 256) return 'The circuit limit is 256 gates. Delete a gate before adding another.';
  const ids = new Set<string>();
  for (const gate of request.gates) {
    if (ids.has(gate.id)) return 'Gate IDs must be unique.';
    ids.add(gate.id);
    if (gate.targets.length !== 1 || gate.controls.length !== (gate.type === 'cx' ? 1 : 0)) return 'Invalid gate target/control configuration.';
    if (gate.type === 'cx' && gate.controls[0] === gate.targets[0]) return 'CX control and target must be different qubits.';
    if ([...gate.targets, ...gate.controls].some((q) => !Number.isInteger(q) || q < 0 || q >= request.numQubits)) {
      return 'Remove or move gates on the last qubit before removing that qubit.';
    }
  }
  return null;
}

export function editorReducer(history: History, action: Edit): History {
  const { past, present, future } = history;
  if (action.type === 'undo') {
    const previous = past.at(-1);
    return previous ? { past: past.slice(0, -1), present: previous, future: [present, ...future], error: null } : history;
  }
  if (action.type === 'redo') {
    const next = future[0];
    return next ? { past: [...past, present], present: next, future: future.slice(1), error: null } : history;
  }
  let next = present;
  switch (action.type) {
    case 'replace': next = structuredClone(action.request); break;
    case 'reset': next = emptyCircuit(); break;
    case 'insert': {
      const gates = [...present.gates];
      gates.splice(Math.max(0, Math.min(action.index, gates.length)), 0, action.gate);
      next = { ...present, gates };
      break;
    }
    case 'update': next = { ...present, gates: present.gates.map((gate) => gate.id === action.gate.id ? action.gate : gate) }; break;
    case 'delete': next = { ...present, gates: present.gates.filter((gate) => gate.id !== action.id) }; break;
    case 'move': {
      const gates = [...present.gates];
      const index = gates.findIndex((gate) => gate.id === action.id);
      const gate = gates[index];
      if (!gate || index + action.delta < 0 || index + action.delta >= gates.length) return history;
      gates.splice(index, 1);
      gates.splice(index + action.delta, 0, gate);
      next = { ...present, gates };
      break;
    }
    case 'qubits': next = { ...present, numQubits: action.count as SimulationRequest['numQubits'] }; break;
    case 'shots': next = { ...present, shots: action.shots }; break;
  }
  const error = validate(next);
  if (error) return { ...history, error };
  if (circuitKey(next) === circuitKey(present)) return { ...history, error: null };
  // Keep complete request snapshots: order, qubits, shots, templates and reset undo together.
  return { past: [...past, present].slice(-100), present: next, future: [], error: null };
}

const histories = new Map<string, History>();
export function validCircuitDraft(draft: unknown): draft is SimulationRequest {
  if (!draft || typeof draft !== 'object') return false;
  const value = draft as SimulationRequest;
  return value.backend === 'qiskit' && Array.isArray(value.gates) && value.gates.every((gate) =>
    gate && ['h', 'x', 'z', 'cx'].includes(gate.type) && typeof gate.id === 'string' && !!gate.id.trim() && gate.id.length <= 64
    && Array.isArray(gate.targets) && Array.isArray(gate.controls))
    && (value.seedSimulator == null || (Number.isInteger(value.seedSimulator) && value.seedSimulator >= 0 && value.seedSimulator <= 4294967295))
    && validate(value) === null;
}
function restoreDraft(key: string): SimulationRequest | undefined {
  try {
    const draft = JSON.parse(sessionStorage.getItem(`qlp-circuit-${key}-v1`) ?? 'null') as SimulationRequest | null;
    if (validCircuitDraft(draft)) return draft;
  } catch { /* Malformed/unavailable storage must never prevent opening the Lab. */ }
}
export function useCircuitEditor(initialRequest?: SimulationRequest, workspaceKey?: string) {
  const [history, dispatch] = useReducer(editorReducer, undefined, () => {
    if (workspaceKey && histories.has(workspaceKey)) return histories.get(workspaceKey)!;
    const request = initialRequest ?? (workspaceKey ? restoreDraft(workspaceKey) : undefined);
    return { past: [], present: request ? structuredClone(request) : emptyCircuit(), future: [], error: null };
  });
  useLayoutEffect(() => {
    if (!workspaceKey) return;
    histories.set(workspaceKey, history);
    try { sessionStorage.setItem(`qlp-circuit-${workspaceKey}-v1`, JSON.stringify(history.present)); } catch { /* Retain the in-memory draft. */ }
  }, [history, workspaceKey]);
  return { request: history.present, error: history.error, dispatch, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
