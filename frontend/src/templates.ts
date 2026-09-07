import type { SimulationRequest } from './api/types';

export interface CircuitTemplate {
  id: 'empty' | 'x' | 'h' | 'hh' | 'bell';
  label: string;
  description: string;
  request: SimulationRequest;
}

export const templates: CircuitTemplate[] = [
  {
    id: 'empty',
    label: 'Empty',
    description: 'Start with one qubit and no gates.',
    request: {
      numQubits: 1,
      gates: [],
      shots: 1024,
      backend: 'qiskit',
      seedSimulator: 42,
    },
  },
  {
    id: 'x',
    label: 'X',
    description: 'Apply a Pauli-X gate to qubit 0.',
    request: {
      numQubits: 1,
      gates: [{ id: 'g1', type: 'x', targets: [0], controls: [] }],
      shots: 1024,
      backend: 'qiskit',
      seedSimulator: 42,
    },
  },
  {
    id: 'h',
    label: 'H',
    description: 'Apply a Hadamard gate to qubit 0.',
    request: {
      numQubits: 1,
      gates: [{ id: 'g1', type: 'h', targets: [0], controls: [] }],
      shots: 1024,
      backend: 'qiskit',
      seedSimulator: 42,
    },
  },
  {
    id: 'hh',
    label: 'H followed by H',
    description: 'Apply two Hadamard gates to the same qubit, in order.',
    request: {
      numQubits: 1,
      gates: [
        { id: 'g1', type: 'h', targets: [0], controls: [] },
        { id: 'g2', type: 'h', targets: [0], controls: [] },
      ],
      shots: 1024,
      backend: 'qiskit',
      seedSimulator: 42,
    },
  },
  {
    id: 'bell',
    label: 'Bell State',
    description: 'Apply H to qubit 0, then a controlled-X from qubit 0 to qubit 1.',
    request: {
      numQubits: 2,
      gates: [
        { id: 'g1', type: 'h', targets: [0], controls: [] },
        { id: 'g2', type: 'cx', targets: [1], controls: [0] },
      ],
      shots: 1024,
      backend: 'qiskit',
      seedSimulator: 42,
    },
  },
];
