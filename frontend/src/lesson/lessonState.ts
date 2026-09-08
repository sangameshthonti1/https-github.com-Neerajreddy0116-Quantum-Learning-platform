import { useSyncExternalStore } from 'react';
import type { SimulationRequest, SimulationResponse, TraceResponse } from '../api/types';
import { circuitKey } from '../lab/useCircuitEditor';
import { amplitudeCheck, bitCheck, observationCheck, quiz, scoreQuiz } from './content';

export type Experiment = 'h' | 'hh';
export interface Evidence {
  request: SimulationRequest;
  simulation: SimulationResponse;
  trace: TraceResponse;
  prediction: number;
  inspectedSteps: number[];
}
export interface LessonState {
  version: 1;
  stage: number;
  furthest: number;
  checks: Record<string, number>;
  predictions: Partial<Record<Experiment, number>>;
  evidence: Partial<Record<Experiment, Evidence>>;
  drafts: Partial<Record<Experiment, SimulationRequest>>;
  answers: Record<string, number>;
  graded: boolean;
  visited: number[];
  readings: number[];
  quizAttempts: { answers: Record<string, number> }[];
}
const storageKey = 'qlp-superposition-v1';
const initial = (): LessonState => ({ version: 1, stage: 0, furthest: 0, checks: {}, predictions: {}, evidence: {}, drafts: {}, answers: {}, graded: false, visited: [], readings: [], quizAttempts: [] });
function restore(): LessonState {
  try {
    const s = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as LessonState | null;
    if (s?.version === 1 && Number.isInteger(s.stage) && s.stage >= 0 && s.stage <= 8
      && Number.isInteger(s.furthest) && s.furthest >= s.stage && s.furthest <= 8
      && s.checks && s.predictions && s.evidence && s.drafts && s.answers && typeof s.graded === 'boolean') {
      // Additive migration: retain every existing answer and experiment. Furthest
      // never proves a reading was completed, so do not turn it into credit.
      return { ...s, visited: s.visited ?? [s.stage], readings: s.readings ?? [],
        quizAttempts: s.quizAttempts ?? (s.graded ? [{ answers: { ...s.answers } }] : []) };
    }
  } catch { /* Storage may be unavailable or from an interrupted older session. */ }
  return initial();
}
let state = restore();
const listeners = new Set<() => void>();
export const getLesson = () => state;
export function updateLesson(update: (previous: LessonState) => LessonState) {
  state = update(state);
  try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep in-memory progress when storage is blocked. */ }
  listeners.forEach((notify) => notify());
}
export function useLesson() {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, getLesson);
}
export function visitSection(s: LessonState, stage: number): LessonState {
  return { ...s, stage, furthest: Math.max(s.furthest, stage), visited: [...new Set([...s.visited, stage])] };
}
export const hasPassedQuiz = (s: LessonState) => s.quizAttempts.some((attempt) => scoreQuiz(attempt.answers) === quiz.length);
export function hasExperimentEvidence(s: LessonState, experiment: Experiment) {
  const e = s.evidence[experiment];
  return !!e && Number.isInteger(e.prediction) && e.prediction >= 0 && e.prediction <= 3
    && experimentMatches(experiment, e.request, { request: e.request, response: e.simulation }, { request: e.request, response: e.trace })
    && e.trace.steps.every((step) => e.inspectedSteps.includes(step.index));
}
// Preserve the existing lesson rule: both collected experiments and a passed quiz.
// Reading acknowledgements describe section progress, not additional prerequisites.
export const isLessonComplete = (s: LessonState) => hasPassedQuiz(s) && hasExperimentEvidence(s, 'h') && hasExperimentEvidence(s, 'hh');
export type SectionStatus = 'Not started' | 'In progress' | 'Completed';
export function sectionStatus(s: LessonState, stage: number): SectionStatus {
  const completed = [s.readings.includes(0), s.checks.bit === bitCheck.correct,
    s.checks.amplitude === amplitudeCheck.correct, s.readings.includes(3),
    s.predictions.h !== undefined, hasExperimentEvidence(s, 'h'),
    hasExperimentEvidence(s, 'h') && s.checks.observation === observationCheck.correct,
    hasExperimentEvidence(s, 'hh'), hasPassedQuiz(s)];
  if (completed[stage]) return 'Completed';
  const activity = [false, s.checks.bit !== undefined, s.checks.amplitude !== undefined, false,
    false, !!s.drafts.h, s.checks.observation !== undefined, s.predictions.hh !== undefined || !!s.drafts.hh,
    Object.keys(s.answers).length > 0 || s.quizAttempts.length > 0];
  return s.visited.includes(stage) || activity[stage] ? 'In progress' : 'Not started';
}
export function lessonCircuit(experiment: Experiment): SimulationRequest {
  return structuredClone(state.drafts[experiment] ?? (experiment === 'hh' ? state.evidence.h?.request : undefined)
    ?? { numQubits: 1, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42 });
}
export function isLessonCircuit(request: SimulationRequest, experiment: Experiment) {
  return request.numQubits === 1 && request.gates.length === (experiment === 'h' ? 1 : 2)
    && request.gates.every((g) => g.type === 'h' && g.targets.length === 1 && g.targets[0] === 0 && g.controls.length === 0);
}
const near = (a: number | undefined, b: number) => a !== undefined && Number.isFinite(a) && Math.abs(a - b) < 1e-10;
/** Both validated API responses must belong to the exact current request, including gate IDs, shots and seed. */
export function experimentMatches(experiment: Experiment, request: SimulationRequest,
  result: { request: SimulationRequest; response: SimulationResponse } | null,
  trace: { request: SimulationRequest; response: TraceResponse } | null) {
  if (!result || !trace || !isLessonCircuit(request, experiment)
    || circuitKey(request) !== circuitKey(result.request) || circuitKey(request) !== circuitKey(trace.request)) return false;
  const steps = trace.response.steps;
  const final = steps.at(-1);
  const p0 = experiment === 'h' ? 0.5 : 1;
  return steps.length === request.gates.length + 1 && result.response.metadata.gateCount === request.gates.length
    && near(steps[0]?.probabilities['0'], 1) && near(steps[1]?.probabilities['0'], 0.5)
    && near(steps[1]?.qubits[0]?.blochVector.x, 1)
    && near(final?.probabilities['0'], p0) && near(final?.probabilities['1'], 1 - p0)
    && near(result.response.probabilities['0'], p0) && near(result.response.probabilities['1'], 1 - p0);
}
