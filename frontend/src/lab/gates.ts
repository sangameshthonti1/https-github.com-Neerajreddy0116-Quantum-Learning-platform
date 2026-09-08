import type { Gate } from '../api/types';

type GateDefinition = { name: string; label: string; group: 'Basic' | 'Phase' | 'Rotation' | 'Multi-qubit'; controls: number; targets: number; parameterized?: boolean; description: string };
export const gateDefinitions: Record<Gate['type'], GateDefinition> = {
  h: { name: 'Hadamard', label: 'H', group: 'Basic', controls: 0, targets: 1, description: 'Create or recombine equal superpositions.' },
  x: { name: 'Pauli X', label: 'X', group: 'Basic', controls: 0, targets: 1, description: 'Exchange the amplitudes of |0⟩ and |1⟩.' },
  y: { name: 'Pauli Y', label: 'Y', group: 'Basic', controls: 0, targets: 1, description: 'Map |0⟩ to i|1⟩ and |1⟩ to −i|0⟩.' },
  z: { name: 'Pauli Z', label: 'Z', group: 'Basic', controls: 0, targets: 1, description: 'Change the sign of the |1⟩ amplitude.' },
  s: { name: 'Quarter phase', label: 'S', group: 'Phase', controls: 0, targets: 1, description: 'Multiply the |1⟩ amplitude by i; phase +π/2.' },
  sdg: { name: 'Inverse S', label: 'S†', group: 'Phase', controls: 0, targets: 1, description: 'Undo S; phase −π/2 on |1⟩.' },
  t: { name: 'Eighth phase', label: 'T', group: 'Phase', controls: 0, targets: 1, description: 'Add phase +π/4 to the |1⟩ amplitude.' },
  tdg: { name: 'Inverse T', label: 'T†', group: 'Phase', controls: 0, targets: 1, description: 'Undo T; phase −π/4 on |1⟩.' },
  p: { name: 'Phase angle', label: 'P', group: 'Phase', controls: 0, targets: 1, parameterized: true, description: 'Multiply |1⟩ by exp(iθ), leaving |0⟩ unchanged.' },
  rx: { name: 'Rotate X', label: 'RX', group: 'Rotation', controls: 0, targets: 1, parameterized: true, description: 'Rotate by θ radians about the Bloch sphere X axis.' },
  ry: { name: 'Rotate Y', label: 'RY', group: 'Rotation', controls: 0, targets: 1, parameterized: true, description: 'Rotate by θ radians about the Bloch sphere Y axis.' },
  rz: { name: 'Rotate Z', label: 'RZ', group: 'Rotation', controls: 0, targets: 1, parameterized: true, description: 'Rotate about Z: phases −θ/2 on |0⟩ and +θ/2 on |1⟩.' },
  cx: { name: 'Controlled X', label: 'CX', group: 'Multi-qubit', controls: 1, targets: 1, description: 'Flip the target when the control is |1⟩.' },
  cz: { name: 'Controlled Z', label: 'CZ', group: 'Multi-qubit', controls: 1, targets: 1, description: 'Negate the amplitude when both qubits are |1⟩.' },
  swap: { name: 'Swap wires', label: 'SWAP', group: 'Multi-qubit', controls: 0, targets: 2, description: 'Exchange the states of two qubits, including their correlations.' },
  ccx: { name: 'Toffoli', label: 'CCX', group: 'Multi-qubit', controls: 2, targets: 1, description: 'Flip the target only when both controls are |1⟩.' },
};
export const gateTypes = Object.keys(gateDefinitions) as Gate['type'][];
export const gateGroups = ['Basic', 'Phase', 'Rotation', 'Multi-qubit'] as const;
export const arity = (type: Gate['type']) => gateDefinitions[type].controls + gateDefinitions[type].targets;
export const gateMeaning = (gate: Gate) => JSON.stringify([gate.type, gate.controls, gate.targets, gate.params ?? []]);

/** Qubit operands always follow Qiskit/OpenQASM order: controls, then targets. */
export function makeGate(type: Gate['type'], qubits: number[], angle = Math.PI / 2, id: string = crypto.randomUUID()): Gate {
  switch (type) {
    case 'rx': case 'ry': case 'rz': case 'p': return { id, type, controls: [], targets: [qubits[0]!], params: [angle] };
    case 'cx': case 'cz': return { id, type, controls: [qubits[0]!], targets: [qubits[1]!] };
    case 'swap': return { id, type, controls: [], targets: [qubits[0]!, qubits[1]!] };
    case 'ccx': return { id, type, controls: [qubits[0]!, qubits[1]!], targets: [qubits[2]!] };
    default: return { id, type, controls: [], targets: [qubits[0]!] };
  }
}

/** Only display exact common presets; decimal serialization never rounds. */
export function angleText(value: number): string {
  const presets: [number, string][] = [[0, '0'], [Math.PI / 4, 'pi/4'], [Math.PI / 2, 'pi/2'], [Math.PI, 'pi'], [2 * Math.PI, '2*pi'], [-Math.PI / 4, '-pi/4'], [-Math.PI / 2, '-pi/2'], [-Math.PI, '-pi']];
  return presets.find(([angle]) => angle === value)?.[1] ?? String(value);
}
