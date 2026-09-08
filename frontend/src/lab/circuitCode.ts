/** Pure, bounded serializers; no user strings are interpolated as executable code. */
import type { Gate, SimulationRequest } from '../api/types';
import { angleText, gateMeaning } from './gates';

export const MAX_CODE_LENGTH = 32768;

export function toOpenQasm(circuit: SimulationRequest): string {
  return ['OPENQASM 3.0;', 'include "stdgates.inc";', '', '// Every qubit starts in |0>. Angles are in radians.',
    `qubit[${circuit.numQubits}] q;`, '', ...circuit.gates.map((gate) => {
      const angle = gate.params ? `(${angleText(gate.params[0])})` : '';
      return `${gate.type}${angle} ${[...gate.controls, ...gate.targets].map((q) => `q[${q}]`).join(', ')};`;
    }), '', '// Run Simulation samples all qubits at the end.', ''].join('\n');
}

/** Educational construction only. The application never executes this string. */
export function toQiskitPython(circuit: SimulationRequest): string {
  return ['# Read-only example of the applied circuit; not executed here.', 'from math import pi', 'from qiskit import QuantumCircuit',
    'from qiskit.quantum_info import Statevector', '', `qc = QuantumCircuit(${circuit.numQubits})`,
    ...circuit.gates.map((gate) => `qc.${gate.type}(${[...(gate.params ? [angleText(gate.params[0])] : []), ...gate.controls, ...gate.targets].join(', ')})`),
    '', '# Ideal state BEFORE measurement, in q[n-1]...q[0] order.', 'state = Statevector.from_instruction(qc)',
    'print(state)', '', '# To sample this circuit separately, add terminal measurements', '# and run a local AerSimulator with your chosen shots and seed.', ''].join('\n');
}

/** IDs are editor metadata. Reuse matching operation IDs without QASM extensions. */
export function reconcileGateIds(previous: Gate[], parsed: Gate[]): Gate[] {
  const available = new Map<string, string[]>();
  for (const gate of previous) {
    const key = gateMeaning(gate);
    available.set(key, [...(available.get(key) ?? []), gate.id]);
  }
  return parsed.map((gate) => ({ ...gate, id: available.get(gateMeaning(gate))?.shift() ?? crypto.randomUUID() }));
}

export const codeTemplates = {
  h: { label: 'One-qubit H', source: 'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[1] q;\nh q[0];\n' },
  bell: { label: 'Bell pair', source: 'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n' },
  rotation: { label: 'Parameterized rotation', source: 'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[1] q;\n// pi/2 radians is a quarter turn.\nry(pi/2) q[0];\n' },
  ccx: { label: 'Three-qubit Toffoli', source: 'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[3] q;\nx q[0];\nx q[1];\nccx q[0], q[1], q[2];\n' },
};
