/** JSON contract: docs/API_CONTRACT.md. No Qiskit-specific objects. */
export type SimulatorBackend = 'qiskit' | 'pennylane';
export const simulatorLabels: Record<SimulatorBackend, string> = {
  qiskit: 'Qiskit Aer', pennylane: 'PennyLane · default.qubit',
};
export const isSimulatorBackend = (value: unknown): value is SimulatorBackend => value === 'qiskit' || value === 'pennylane';

export type Gate =
  | { id: string; type: 'h' | 'x' | 'y' | 'z' | 's' | 'sdg' | 't' | 'tdg'; targets: [number]; controls: []; params?: never }
  | { id: string; type: 'rx' | 'ry' | 'rz' | 'p'; targets: [number]; controls: []; params: [number] }
  | { id: string; type: 'cx' | 'cz'; targets: [number]; controls: [number]; params?: never }
  | { id: string; type: 'swap'; targets: [number, number]; controls: []; params?: never }
  | { id: string; type: 'ccx'; targets: [number]; controls: [number, number]; params?: never };

export interface SimulationRequest {
  numQubits: 1 | 2 | 3;
  gates: Gate[];
  shots: number;
  backend: SimulatorBackend;
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
  qiskitVersion?: string;
  aerVersion?: string;
  engine?: 'pennylane.default.qubit';
  pennylaneVersion?: string;
}

export interface SimulationResponse {
  backend: SimulatorBackend;
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
  backend: SimulatorBackend;
  numQubits: 1 | 2 | 3;
  basisOrder: string[];
  steps: TraceStep[];
  metadata: {
    engine: 'qiskit.quantum_info.Statevector' | 'pennylane.default.qubit';
    method: 'statevector';
    measurement: 'terminal-all';
    statevectorStage: 'before-measurement';
    samplingPerformed: false;
    bitOrder: 'q[n-1]...q[0]';
    reducedBasisOrder: ['0', '1'];
    globalPhase: 'qiskit-native' | 'pennylane-native';
    gateCount: number;
    stepCount: number;
    executionTimeMs: number;
    qiskitVersion?: string;
    pennylaneVersion?: string;
  };
}
