import type { SimulationRequest, SimulationResponse, SimulatorBackend, TraceResponse } from '../api/types';
import type { AlgorithmStage } from '../algorithms/types';

export type VariationalId = 'vqe' | 'qaoa';
export type GraphId = 'edge' | 'path' | 'triangle' | 'weighted-path';
interface Settings {
  backend: SimulatorBackend; initialParameters: number[] | null; initializationSeed: number;
  maxIterations: number; maxEvaluations: number; timeLimitSeconds: number; shots: number; seedSimulator: number | null;
}
export type ExperimentRequest = Settings & ({ algorithm: 'vqe'; problemId: 'ising-pair' } | { algorithm: 'qaoa'; problemId: GraphId; depth: number });
export interface Graph { numVertices: number; edges: { source: number; target: number; weight: number }[] }
export interface Problem {
  id: string; title: string; units: string;
  hamiltonian: { numQubits: number; terms: { pauli: string; coefficient: number }[]; bitOrder: 'q[n-1]...q[0]' };
  graph: Graph | null;
}
export interface Reference { method: 'diagonalization' | 'enumeration'; value: number; eigenvalues: number[]; cutValues: Record<string, number>; optimalBitstrings: string[] }
export interface Definition {
  version: 1; request: ExperimentRequest; problem: Problem; parameterOrder: string[]; boundParameters: number[];
  ansatz: string; objective: 'energy' | 'negative-expected-cut'; circuit: SimulationRequest;
  circuitDigest: string; stages: AlgorithmStage[]; reference: Reference;
}
export interface Evaluation { evaluation: number; iteration: number; parameters: number[]; expectation: number; objective: number; bestObjective: number; elapsedMs: number }
export interface Optimization {
  method: 'scipy.optimize.minimize/Powell'; scipyVersion: string; objectiveEngine: string; objectiveSamplingPerformed: false;
  initialParameters: number[]; bestParameters: number[]; initialExpectation: number; bestExpectation: number;
  evaluations: number; iterations: number; stoppingReason: 'converged' | 'evaluation_limit' | 'iteration_limit' | 'optimizer_stopped';
  converged: boolean; elapsedMs: number; history: Evaluation[];
}
export interface Result {
  definition: Definition; optimization: Optimization; simulation: SimulationResponse; trace: TraceResponse;
  referenceGap: number; explanation: string;
  cut: null | { expectedCut: number; optimalCutProbability: number; bestSampledBitstring: string; bestSampledCut: number; bestSampledCount: number };
}
export interface Job {
  jobId: string; status: 'running' | 'completed' | 'cancelled' | 'timed_out' | 'failed'; request: ExperimentRequest;
  history: Evaluation[]; elapsedMs: number; result: Result | null; message: string | null;
}
export interface Catalog { version: 1; problems: Problem[]; backends: SimulatorBackend[]; limits: Record<string, number> }
