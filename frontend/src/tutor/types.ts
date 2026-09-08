import type { SimulationRequest, TraceStep } from '../api/types';

export type LessonId = 'measurement' | 'superposition' | 'phase' | 'entanglement';
export interface TutorRequest {
  question: string;
  mode: 'learn' | 'circuit';
  lessonId: LessonId | null;
  circuit: SimulationRequest | null;
  selectedStep: number | null;
  history: { role: 'user' | 'assistant'; content: string }[];
}
export interface CircuitFacts {
  source: 'qiskit-trace';
  bitOrder: 'q[n-1]...q[0]';
  samplingPerformed: false;
  circuit: SimulationRequest;
  selectedStep: number;
  snapshots: TraceStep[];
  totalSteps: number;
}
export interface CircuitSuggestion {
  title: string;
  rationale: string;
  circuit: SimulationRequest;
  facts: CircuitFacts;
}
export interface TutorResponse {
  answer: string;
  deeper: string | null;
  followUp: string | null;
  lessonId: LessonId | null;
  facts: CircuitFacts | null;
  suggestion: CircuitSuggestion | null;
  explanationSource: 'ai';
}
export interface TutorContext {
  lessonId: LessonId | null;
  circuit: SimulationRequest | null;
  selectedStep: number | null;
  label: string;
  key: string;
  apply?: (request: SimulationRequest) => void;
}
