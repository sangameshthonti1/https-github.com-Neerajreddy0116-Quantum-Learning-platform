import { useSyncExternalStore } from 'react';
import type { SimulationRequest, SimulationResponse, TraceResponse } from '../../api/types';
import { isSimulationResponse } from '../../api/client';
import { validTrace } from '../../api/traceClient';
import { circuitKey, validCircuitDraft } from '../../lab/useCircuitEditor';
import type { SectionStatus } from '../lessonState';
import { foundationIds, foundations, getExperiment } from './content';
import type { ExperimentDefinition, FoundationId } from './types';

export interface FoundationEvidence {
  lessonId: FoundationId;
  experimentId: string;
  request: SimulationRequest;
  simulation: SimulationResponse;
  trace: TraceResponse;
  prediction: number;
  inspectedSteps: number[];
}
export interface FoundationState {
  stage: number;
  visited: number[];
  checks: Record<string, number>;
  checkAttempts: Record<string, number[]>;
  predictions: Record<string, number>;
  evidence: Record<string, FoundationEvidence>;
  drafts: Record<string, SimulationRequest>;
  answers: Record<string, number>;
  graded: boolean;
  quizAttempts: Record<string, number>[];
}
const initial = (): FoundationState => ({ stage: 0, visited: [], checks: {}, checkAttempts: {}, predictions: {}, evidence: {}, drafts: {}, answers: {}, graded: false, quizAttempts: [] });
const near = (a: number | undefined, b: number) => a !== undefined && Number.isFinite(a) && Math.abs(a - b) <= 1e-10;
export const blankExperiment = (e: ExperimentDefinition): SimulationRequest => ({ numQubits: e.numQubits, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42 });
export function circuitMatches(e: ExperimentDefinition, request: SimulationRequest) {
  return validCircuitDraft(request) && request.numQubits === e.numQubits && request.gates.length === e.gates.length
    && e.gates.every((gate, i) => { const actual = request.gates[i]!;
      return gate.type === actual.type && actual.targets[0] === gate.target
        && (gate.control === undefined ? actual.controls.length === 0 : actual.controls[0] === gate.control);
    });
}
/** Expected values are lesson assertions, never a source for displayed simulator results. */
export function matchesEvidence(e: ExperimentDefinition, request: SimulationRequest,
  result: { request: SimulationRequest; response: SimulationResponse } | null,
  trace: { request: SimulationRequest; response: TraceResponse } | null) {
  if (!result || !trace || !circuitMatches(e, request)
    || circuitKey(request) !== circuitKey(result.request) || circuitKey(request) !== circuitKey(trace.request)
    || !isSimulationResponse(result.response) || !validTrace(trace.response, request)) return false;
  const simulation = result.response;
  if (simulation.numQubits !== request.numQubits || simulation.shots !== request.shots || simulation.metadata.gateCount !== request.gates.length
    || (request.seedSimulator != null && simulation.metadata.seedSimulator !== request.seedSimulator)) return false;
  const final = e.expected.at(-1)!;
  return simulation.statevector.every((amplitude, i) => near(amplitude.real, final.amplitudes[i]!) && near(amplitude.imag, 0))
    && trace.response.steps.every((step, index) => {
      const expected = e.expected[index];
      return !!expected && step.statevector.every((amplitude, i) => near(amplitude.real, expected.amplitudes[i]!) && near(amplitude.imag, 0))
        && step.qubits.every((qubit, i) => { const vector = expected.bloch[i];
          return !!vector && near(qubit.blochVector.x, vector[0]) && near(qubit.blochVector.y, vector[1]) && near(qubit.blochVector.z, vector[2]);
        });
    });
}
export function validEvidence(id: FoundationId, e: ExperimentDefinition, value: FoundationEvidence | undefined): value is FoundationEvidence {
  try {
    return !!value && value.lessonId === id && value.experimentId === e.id && Number.isInteger(value.prediction)
      && value.prediction >= 0 && value.prediction < e.prediction.options.length && Array.isArray(value.inspectedSteps)
      && matchesEvidence(e, value.request, { request: value.request, response: value.simulation }, { request: value.request, response: value.trace })
      && value.trace.steps.every((step) => value.inspectedSteps.includes(step.index));
  } catch { return false; }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function choices(v: unknown, questions: { id: string; options: string[] }[]): Record<string, number> {
  if (!record(v)) return {};
  return Object.fromEntries(questions.flatMap((q) => Number.isInteger(v[q.id]) && Number(v[q.id]) >= 0 && Number(v[q.id]) < q.options.length ? [[q.id, v[q.id] as number]] : []));
}
const storageKey = (id: FoundationId) => `qlp-foundations-${id}-v1`;
function restore(id: FoundationId): FoundationState {
  const empty = initial();
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(id)) ?? 'null');
    if (!record(saved) || saved.version !== 1 || !record(saved.state)) return empty;
    const s = saved.state; const lesson = foundations[id];
    const checks = lesson.sections.flatMap((section) => section.check ? [section.check] : []);
    const validStage = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) < lesson.sections.length;
    const result: FoundationState = { ...empty, stage: validStage(s.stage) ? s.stage : 0,
      visited: Array.isArray(s.visited) ? s.visited.filter(validStage) : [], checks: choices(s.checks, checks),
      predictions: choices(s.predictions, lesson.experiments.map((e) => ({ ...e.prediction, id: e.id }))),
      answers: choices(s.answers, lesson.quiz), quizAttempts: Array.isArray(s.quizAttempts) ? s.quizAttempts.map((attempt) => choices(attempt, lesson.quiz)).filter((attempt) => lesson.quiz.every((q) => attempt[q.id] !== undefined)) : [],
    };
    result.graded = s.graded === true && lesson.quiz.every((q) => result.answers[q.id] !== undefined) && result.quizAttempts.length > 0;
    for (const q of checks) { const attempts = record(s.checkAttempts) ? s.checkAttempts[q.id] : undefined;
      if (Array.isArray(attempts)) result.checkAttempts[q.id] = attempts.filter((v) => Number.isInteger(v) && v >= 0 && v < q.options.length);
    }
    for (const e of lesson.experiments) {
      const evidence = record(s.evidence) ? s.evidence[e.id] as FoundationEvidence : undefined;
      if (validEvidence(id, e, evidence)) result.evidence[e.id] = evidence;
      const draft = record(s.drafts) ? s.drafts[e.id] : undefined;
      if (validCircuitDraft(draft)) result.drafts[e.id] = draft;
    }
    return result;
  } catch { return empty; }
}
let state = Object.fromEntries(foundationIds.map((id) => [id, restore(id)])) as Record<FoundationId, FoundationState>;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const getFoundations = () => state;
export const useFoundations = () => useSyncExternalStore(subscribe, getFoundations);
export function updateFoundation(id: FoundationId, update: (s: FoundationState) => FoundationState) {
  const next = update(state[id]);
  if (next === state[id]) return;
  state = { ...state, [id]: next };
  try { sessionStorage.setItem(storageKey(id), JSON.stringify({ version: 1, state: next })); } catch { /* Keep the session usable in memory. */ }
  listeners.forEach((notify) => notify());
}
export const visitFoundation = (id: FoundationId, stage: number) => updateFoundation(id, (s) => s.stage === stage && s.visited.includes(stage) ? s : ({ ...s, stage, visited: [...new Set([...s.visited, stage])] }));
export const scoreFoundationQuiz = (id: FoundationId, answers: Record<string, number>) => foundations[id].quiz.filter((q) => answers[q.id] === q.correct).length;
export const passedFoundationQuiz = (id: FoundationId, s: FoundationState) => s.quizAttempts.some((attempt) => scoreFoundationQuiz(id, attempt) === foundations[id].quiz.length);
export const hasFoundationEvidence = (id: FoundationId, s: FoundationState, experiment: string) => {
  const e = getExperiment(id, experiment); return !!e && validEvidence(id, e, s.evidence[experiment]);
};
export function foundationSectionStatus(id: FoundationId, s: FoundationState, index: number): SectionStatus {
  const lesson = foundations[id]; const section = lesson.sections[index]!;
  const complete = index === lesson.sections.length - 1 ? passedFoundationQuiz(id, s)
    : (!section.check || s.checks[section.check.id] === section.check.correct)
      && (!(section.experiment || section.review) || hasFoundationEvidence(id, s, (section.experiment || section.review)!));
  if (complete) return 'Completed';
  const active = s.visited.includes(index) || (section.check && s.checks[section.check.id] !== undefined)
    || (section.experiment && (s.predictions[section.experiment] !== undefined || !!s.drafts[section.experiment]));
  return active ? 'In progress' : 'Not started';
}
export const foundationComplete = (id: FoundationId, s: FoundationState) => foundations[id].sections.every((_, i) => foundationSectionStatus(id, s, i) === 'Completed');
export function foundationCircuit(id: FoundationId, experiment: string) {
  return structuredClone(state[id].drafts[experiment] ?? blankExperiment(getExperiment(id, experiment)!));
}
