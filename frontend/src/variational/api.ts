import { isSimulationResponse } from '../api/client';
import { validTrace } from '../api/traceClient';
import { isSimulatorBackend } from '../api/types';
import { validCircuitDraft } from '../lab/useCircuitEditor';
import type { Catalog, Definition, Evaluation, ExperimentRequest, Job, Problem, Result, VariationalId } from './types';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bounded = (v: unknown, min: number, max: number): v is number => finite(v) && Number.isInteger(v) && v >= min && v <= max;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-10;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const angles = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(x => finite(x) && Math.abs(x) <= Math.PI);
const count = (r: ExperimentRequest) => r.algorithm === 'vqe' ? 4 : 2 * r.depth;
export const requestKey = (r: ExperimentRequest) => JSON.stringify([r.algorithm, r.problemId, r.algorithm === 'qaoa' ? r.depth : null,
  r.backend, r.initialParameters, r.initializationSeed, r.maxIterations, r.maxEvaluations, r.timeLimitSeconds, r.shots, r.seedSimulator]);
export function defaults(id: VariationalId): ExperimentRequest {
  const settings = { backend: 'qiskit' as const, initialParameters: null, initializationSeed: 42, maxIterations: 12,
    maxEvaluations: 256, timeLimitSeconds: 20, shots: 1024, seedSimulator: 42 };
  return id === 'vqe' ? { ...settings, algorithm: id, problemId: 'ising-pair' } : { ...settings, algorithm: id, problemId: 'edge', depth: 1 };
}
export function validRequest(v: unknown): v is ExperimentRequest {
  if (!record(v) || !isSimulatorBackend(v.backend) || !bounded(v.initializationSeed, 0, 4294967295)
    || !bounded(v.maxIterations, 1, 20) || !bounded(v.maxEvaluations, 4, 256) || !bounded(v.timeLimitSeconds, 1, 30)
    || !bounded(v.shots, 1, 8192) || !(v.seedSimulator === null || bounded(v.seedSimulator, 0, 4294967295))) return false;
  const n = v.algorithm === 'vqe' && v.problemId === 'ising-pair' ? 4
    : v.algorithm === 'qaoa' && ['edge', 'path', 'triangle', 'weighted-path'].includes(String(v.problemId)) && bounded(v.depth, 1, 2) ? 2 * v.depth : 0;
  return n > 0 && (v.initialParameters === null || angles(v.initialParameters, n));
}
function validProblem(v: unknown): v is Problem {
  if (!record(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.units !== 'string'
    || !record(v.hamiltonian) || !bounded(v.hamiltonian.numQubits, 1, 3) || v.hamiltonian.bitOrder !== 'q[n-1]...q[0]'
    || !Array.isArray(v.hamiltonian.terms) || !v.hamiltonian.terms.length || v.hamiltonian.terms.length > 8) return false;
  const n = v.hamiltonian.numQubits;
  if (!v.hamiltonian.terms.every(t => record(t) && typeof t.pauli === 'string' && /^[IXYZ]+$/.test(t.pauli)
    && t.pauli.length === n && finite(t.coefficient) && Math.abs(t.coefficient) <= 4)) return false;
  return v.graph === null || (record(v.graph) && v.graph.numVertices === n && n >= 2 && Array.isArray(v.graph.edges)
    && v.graph.edges.length > 0 && v.graph.edges.length <= 3 && v.graph.edges.every(e => record(e) && bounded(e.source, 0, n - 1)
      && bounded(e.target, e.source + 1, n - 1) && finite(e.weight) && e.weight > 0 && e.weight <= 2));
}
export function validDefinition(v: unknown, req?: ExperimentRequest): v is Definition {
  if (!record(v) || v.version !== 1 || !validRequest(v.request) || (req && requestKey(req) !== requestKey(v.request))
    || !validCircuitDraft(v.circuit) || !validProblem(v.problem) || v.problem.id !== v.request.problemId
    || v.circuit.numQubits !== v.problem.hamiltonian.numQubits || v.circuit.backend !== v.request.backend
    || v.circuit.shots !== v.request.shots || v.circuit.seedSimulator !== v.request.seedSimulator
    || !angles(v.boundParameters, count(v.request)) || !Array.isArray(v.parameterOrder) || v.parameterOrder.length !== count(v.request)
    || !v.parameterOrder.every(x => typeof x === 'string') || typeof v.ansatz !== 'string'
    || v.objective !== (v.request.algorithm === 'vqe' ? 'energy' : 'negative-expected-cut')
    || typeof v.circuitDigest !== 'string' || !/^[a-f0-9]{64}$/.test(v.circuitDigest)
    || !Array.isArray(v.stages) || v.stages.length < 1 || v.stages.length > 5 || !record(v.reference)) return false;
  let end = 0;
  for (const s of v.stages) {
    if (!record(s) || typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.description !== 'string'
      || s.startStep !== end || !bounded(s.endStep, end, v.circuit.gates.length)) return false;
    end = s.endStep;
  }
  const ref = v.reference;
  if (end !== v.circuit.gates.length || !finite(ref.value) || !Array.isArray(ref.eigenvalues) || !ref.eigenvalues.every(finite)
    || !record(ref.cutValues) || !Array.isArray(ref.optimalBitstrings)) return false;
  if (v.request.algorithm === 'vqe') return v.problem.graph === null && ref.method === 'diagonalization'
    && ref.eigenvalues.length === 4 && near(ref.value, -Math.sqrt(17) / 2) && near(ref.value, Math.min(...ref.eigenvalues));
  if (v.problem.graph === null || ref.method !== 'enumeration' || Object.keys(ref.cutValues).length !== 2 ** v.circuit.numQubits) return false;
  const graph = v.problem.graph;
  for (let i = 0; i < 2 ** graph.numVertices; i++) {
    const cut = graph.edges.reduce((sum, e) => sum + ((((i >> e.source) ^ (i >> e.target)) & 1) * e.weight), 0);
    if (ref.cutValues[i.toString(2).padStart(graph.numVertices, '0')] !== cut) return false;
  }
  return ref.value === Math.max(...Object.values(ref.cutValues) as number[]) && same(ref.optimalBitstrings,
    Object.entries(ref.cutValues).filter(([, value]) => value === ref.value).map(([label]) => label).sort());
}
function validHistory(v: unknown, req: ExperimentRequest): v is Evaluation[] {
  if (!Array.isArray(v) || v.length > req.maxEvaluations) return false;
  let best = Infinity, time = 0, iteration = 0;
  return v.every((e, i) => {
    if (!record(e) || e.evaluation !== i + 1 || !bounded(e.iteration, iteration, req.maxIterations)
      || !angles(e.parameters, count(req)) || !finite(e.expectation) || !finite(e.objective) || !finite(e.bestObjective)
      || !near(e.objective, (req.algorithm === 'vqe' ? 1 : -1) * e.expectation) || !finite(e.elapsedMs) || e.elapsedMs < time) return false;
    best = Math.min(best, e.objective); time = e.elapsedMs; iteration = e.iteration;
    return near(best, e.bestObjective);
  });
}
/** Independent phase-sensitive amplitude calculation for response consistency. */
function energy(result: Result) {
  const psi = result.simulation.statevector, n = result.simulation.numQubits;
  let value = 0;
  for (const term of result.definition.problem.hamiltonian.terms) for (let i = 0; i < psi.length; i++) {
    let j = i, re = 1, im = 0;
    for (let q = 0; q < n; q++) {
      const p = term.pauli[n - 1 - q], bit = (i >> q) & 1;
      if (p === 'X' || p === 'Y') j ^= 1 << q;
      if (p === 'Y') { const sign = bit ? -1 : 1; [re, im] = [-im * sign, re * sign]; }
      if (p === 'Z' && bit) { re = -re; im = -im; }
    }
    const a = psi[i]!, b = psi[j]!;
    value += term.coefficient * (b.real * (re * a.real - im * a.imag) + b.imag * (re * a.imag + im * a.real));
  }
  return value;
}
export function validResult(v: unknown, req: ExperimentRequest): v is Result {
  if (!record(v) || !validDefinition(v.definition, req) || !isSimulationResponse(v.simulation)
    || !validTrace(v.trace, v.definition.circuit) || !record(v.optimization) || typeof v.explanation !== 'string' || !finite(v.referenceGap)) return false;
  const o = v.optimization, d = v.definition, s = v.simulation, trace = v.trace;
  if (!validHistory(o.history, req) || !o.history.length || o.evaluations !== o.history.length || !bounded(o.iterations, 0, req.maxIterations)
    || o.method !== 'scipy.optimize.minimize/Powell' || typeof o.scipyVersion !== 'string' || o.objectiveEngine !== v.trace.metadata.engine
    || o.objectiveSamplingPerformed !== false || !angles(o.initialParameters, count(req)) || !angles(o.bestParameters, count(req))
    || !finite(o.initialExpectation) || !finite(o.bestExpectation) || !finite(o.elapsedMs) || o.elapsedMs < 0
    || !['converged', 'evaluation_limit', 'iteration_limit', 'optimizer_stopped'].includes(String(o.stoppingReason))
    || o.converged !== (o.stoppingReason === 'converged') || s.backend !== req.backend || s.numQubits !== d.circuit.numQubits
    || s.shots !== req.shots || s.metadata.gateCount !== d.circuit.gates.length || (req.seedSimulator !== null && s.metadata.seedSimulator !== req.seedSimulator)) return false;
  const best = o.history.reduce((a, b) => b.objective < a.objective ? b : a);
  if (!same(o.bestParameters, best.parameters) || !same(d.boundParameters, best.parameters) || !same(o.initialParameters, o.history[0]!.parameters)
    || !near(o.initialExpectation, o.history[0]!.expectation) || !near(o.bestExpectation, best.expectation)
    || v.referenceGap < -1e-10 || !near(v.referenceGap, (req.algorithm === 'vqe' ? 1 : -1) * (best.expectation - d.reference.value))) return false;
  // Within one execution the native phases are preserved by both existing adapters.
  if (!s.statevector.every((a, i) => near(a.real, trace.steps.at(-1)!.statevector[i]!.real) && near(a.imag, trace.steps.at(-1)!.statevector[i]!.imag))) return false;
  if (!near(energy(v as unknown as Result), best.expectation)) return false;
  if (req.algorithm === 'vqe') return v.cut === null;
  const c = v.cut;
  if (!record(c) || !finite(c.expectedCut) || !finite(c.optimalCutProbability) || !near(c.expectedCut, best.expectation)
    || !near(c.optimalCutProbability, d.reference.optimalBitstrings.reduce((sum, b) => sum + s.probabilities[b]!, 0))
    || typeof c.bestSampledBitstring !== 'string' || !bounded(c.bestSampledCount, 1, req.shots)
    || c.bestSampledCount !== s.counts[c.bestSampledBitstring] || c.bestSampledCut !== d.reference.cutValues[c.bestSampledBitstring]) return false;
  return c.bestSampledCut === Math.max(...Object.entries(s.counts).filter(([, n]) => n > 0).map(([b]) => d.reference.cutValues[b]!));
}
function validJob(v: unknown, req: ExperimentRequest, id: string): v is Job {
  return record(v) && v.jobId === id && validRequest(v.request) && requestKey(v.request) === requestKey(req)
    && validHistory(v.history, req) && finite(v.elapsedMs) && v.elapsedMs >= 0 && (v.message === null || typeof v.message === 'string')
    && ['running', 'completed', 'cancelled', 'timed_out', 'failed'].includes(String(v.status))
    && (v.status === 'completed' ? validResult(v.result, req) && same(v.history, v.result.optimization.history) : v.result === null);
}
async function http(path: string, method = 'GET', body?: ExperimentRequest, signal?: AbortSignal): Promise<unknown> {
  try {
    const r = await fetch(`/api/variational${path}`, { method, credentials: 'omit', keepalive: method === 'DELETE',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
    const data: unknown = await r.json();
    if (!r.ok) throw new Error(`Optimization service (HTTP ${r.status}). ${record(data) && record(data.error) && typeof data.error.message === 'string' ? data.error.message : 'Check the backend connection and request limits, then retry.'}`);
    return data;
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (e instanceof TypeError) throw new Error('Optimization service unavailable. Check the backend connection and retry.');
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('The service did not respond within 10 seconds. Any accepted job still has its server-side deadline.');
    throw e;
  }
}
export async function catalog(signal: AbortSignal): Promise<Catalog> {
  const v = await http('', 'GET', undefined, signal);
  if (!record(v) || v.version !== 1 || !Array.isArray(v.problems) || !v.problems.every(validProblem)
    || !same(v.problems.map(p => p.id), ['ising-pair', 'edge', 'path', 'triangle', 'weighted-path'])
    || !same(v.backends, ['qiskit', 'pennylane']) || !record(v.limits) || v.limits.activeJobsPerProcess !== 1
    || v.limits.maxEvaluations !== 256 || v.limits.maxTimeSeconds !== 30) throw new Error('The optimization catalog could not be validated.');
  return v as unknown as Catalog;
}
export async function build(req: ExperimentRequest, signal: AbortSignal) {
  const v = await http('/build', 'POST', req, signal);
  if (!validDefinition(v, req)) throw new Error('The circuit preview did not match this experiment.');
  return v;
}
export async function job(req: ExperimentRequest, id: string, method: 'POST' | 'GET' | 'DELETE', signal?: AbortSignal) {
  const v = await http(`/jobs/${id}`, method, method === 'POST' ? req : undefined, signal);
  if (!validJob(v, req, id)) throw new Error('The optimization response did not match this experiment or its scientific data contract. No final results were displayed.');
  return v;
}
