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

/** Exact POST /api/simulate/trace contract; shots and seed are request-only. */
export interface BlochVector { x: number; y: number; z: number }

export interface ReducedQubitState {
  qubit: number;
  densityMatrix: [[ComplexAmplitude, ComplexAmplitude], [ComplexAmplitude, ComplexAmplitude]];
  blochVector: BlochVector;
}

export interface TraceStep {
  index: number;
  gate: Gate | null;
  statevector: ComplexAmplitude[];
  probabilities: Record<string, number>;
  qubits: ReducedQubitState[];
}

export interface TraceResponse {
  backend: 'qiskit';
  numQubits: 1 | 2 | 3;
  basisOrder: string[];
  steps: TraceStep[];
  metadata: {
    engine: 'qiskit.quantum_info.Statevector';
    method: 'statevector';
    measurement: 'terminal-all';
    statevectorStage: 'before-measurement';
    samplingPerformed: false;
    bitOrder: 'q[n-1]...q[0]';
    reducedBasisOrder: ['0', '1'];
    globalPhase: 'qiskit-native';
    gateCount: number;
    stepCount: number;
    executionTimeMs: number;
    qiskitVersion: string;
  };
}
