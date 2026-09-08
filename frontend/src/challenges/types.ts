import type { ComplexAmplitude, Gate, SimulationRequest } from '../api/types';

export interface Challenge {
  id: string; version: 1; title: string;
  difficulty: 'First steps' | 'Building intuition' | 'Making connections';
  objective: string; statement: string; initialState: string;
  startingCircuit: SimulationRequest; allowedGates: Gate['type'][]; maxGates: number;
  preparationSteps: number; constraints: string[];
  criterion: 'state' | 'distribution'; targetLabel: string;
  targetState: ComplexAmplitude[] | null; targetProbabilities: Record<string, number>;
  hints: string[]; tolerance: number; scoring: string;
}
export interface Grade {
  challengeId: string; challengeVersion: 1; submissionId: string;
  circuit: SimulationRequest; circuitDigest: string;
  valid: boolean; targetAchieved: boolean; score: number; criterion: 'state' | 'distribution';
  metrics: { fidelity: number | null; totalVariationDistance: number; similarity: number; stateNorm: number; tolerance: number } | null;
  violatedConstraints: string[]; feedback: string; nextHint: string | null; inspectStep: number | null;
  statevector: ComplexAmplitude[] | null; probabilities: Record<string, number> | null;
  engine: 'qiskit-aer-statevector'; bitOrder: 'q[n-1]...q[0]'; samplingUsedForGrading: false;
}
