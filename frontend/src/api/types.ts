/** JSON contract: docs/API_CONTRACT.md. No Qiskit-specific objects. */
export type Gate =
  | { id: string; type: 'h' | 'x' | 'z'; targets: [number]; controls: [] }
  | { id: string; type: 'cx'; targets: [number]; controls: [number] };

export interface SimulationRequest {
  numQubits: 1 | 2 | 3;
  gates: Gate[];
  shots: number;
  backend: 'qiskit';
  seedSimulator?: number | null;
}

export interface ComplexAmplitude {
  real: number;
  imag: number;
}

export interface ExecutionMetadata {
  method: 'statevector';
  measurement: 'terminal-all';
  statevectorStage: 'before-measurement';
  bitOrder: 'q[n-1]...q[0]';
  seedSimulator: number;
  gateCount: number;
  circuitDepth: number;
  executionTimeMs: number;
  qiskitVersion: string;
  aerVersion: string;
}

export interface SimulationResponse {
  backend: 'qiskit';
  numQubits: 1 | 2 | 3;
  probabilities: Record<string, number>;
  counts: Record<string, number>;
  statevector: ComplexAmplitude[];
  shots: number;
  metadata: ExecutionMetadata;
}

export interface ValidationErrorResponse {
  detail: { loc: (string | number)[]; msg: string; type: string }[];
}

export interface ExecutionErrorResponse {
  error: { code: 'simulation_failed'; message: string };
}
