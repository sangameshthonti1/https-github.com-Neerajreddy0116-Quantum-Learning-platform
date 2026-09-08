import type { SimulationRequest, SimulationResponse, TraceResponse } from '../api/types';

export type AlgorithmId = 'deutsch-jozsa' | 'grover';
export type OracleId = 'zero' | 'one' | 'q0' | 'not-q0' | 'q1' | 'not-q1' | 'xor' | 'xnor';
export type AlgorithmParameters =
  | { algorithm: 'deutsch-jozsa'; inputQubits: 1 | 2; oracleId: OracleId; shots: number; seedSimulator: number | null }
  | { algorithm: 'grover'; numQubits: 1 | 2; markedItem: string; iterations: number; shots: number; seedSimulator: number | null };
export interface OracleDefinition {
  id: OracleId; label: string; inputQubits: 1 | 2; category: 'constant' | 'balanced';
  truthTable: { input: string; output: 0 | 1 }[];
}
export interface AlgorithmEntry {
  id: AlgorithmId; title: string; summary: string; registerSizes: (1 | 2)[];
  maxIterations: number | null; oracles: OracleDefinition[];
}
export interface AlgorithmStage {
  id: string; title: string; description: string; startStep: number; endStep: number; iteration: number | null;
}
export interface AlgorithmDefinition {
  version: 1; parameters: AlgorithmParameters; circuit: SimulationRequest; circuitDigest: string;
  stages: AlgorithmStage[]; inputRegister: number[]; ancillaQubit: number | null;
  oracle: OracleDefinition | null; bitOrder: 'q[n-1]...q[0]';
}
export interface AlgorithmRun {
  definition: AlgorithmDefinition; simulation: SimulationResponse; trace: TraceResponse;
  interpretation: ({
    algorithm: 'deutsch-jozsa'; classification: 'constant' | 'balanced' | 'inconclusive';
    inputProbabilities: Record<string, number>; inputCounts: Record<string, number>;
    zeroInputProbability: number; oracleQueries: 1; classicalWorstCaseQueries: number;
  } | {
    algorithm: 'grover'; markedItem: string; successProbability: number;
    sampledSuccessCount: number; sampledSuccessRate: number;
    iterations: { iteration: number; step: number; successProbability: number }[];
  }) & { explanation: string; tolerance: number };
}
