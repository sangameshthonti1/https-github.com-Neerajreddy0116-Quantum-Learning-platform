import { useEffect, useState } from 'react';
import type { SimulationRequest } from '../api/types';
import { circuitKey, validCircuitDraft } from '../lab/useCircuitEditor';
import type { Challenge, Grade } from './types';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const unit = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
function physical(vector: unknown, probabilities: unknown, n: number) {
  if (!Array.isArray(vector) || vector.length !== 2 ** n || !record(probabilities) || Object.keys(probabilities).length !== vector.length) return false;
  let sum = 0;
  for (const [i, a] of vector.entries()) {
    const p = probabilities[i.toString(2).padStart(n, '0')];
    if (!record(a) || !finite(a.real) || !finite(a.imag) || !finite(p) || p < 0 || p > 1 + 1e-10 || Math.abs(p - a.real ** 2 - a.imag ** 2) > 1e-10) return false;
    sum += p;
  }
  return Math.abs(sum - 1) <= 1e-10;
}
function validChallenge(v: unknown): v is Challenge {
  if (!record(v) || typeof v.id !== 'string' || !/^[a-z0-9-]+$/.test(v.id) || v.version !== 1
    || !['First steps', 'Building intuition', 'Making connections'].includes(String(v.difficulty))
    || !['title', 'objective', 'statement', 'initialState', 'targetLabel', 'scoring'].every(k => typeof v[k] === 'string')
    || !validCircuitDraft(v.startingCircuit) || !strings(v.allowedGates) || !v.allowedGates.every(g => ['h', 'x', 'z', 'cx'].includes(g))
    || v.maxGates !== 256 || v.preparationSteps !== v.startingCircuit.gates.length || !strings(v.constraints)
    || !strings(v.hints) || !v.hints.length || v.tolerance !== 1e-10 || !record(v.targetProbabilities)) return false;
  if (v.criterion === 'state') return physical(v.targetState, v.targetProbabilities, v.startingCircuit.numQubits);
  if (v.criterion !== 'distribution' || v.targetState !== null) return false;
  const basis = Array.from({ length: 2 ** v.startingCircuit.numQubits }, (_, i) => i.toString(2).padStart((v.startingCircuit as SimulationRequest).numQubits, '0'));
  return Object.keys(v.targetProbabilities).length === basis.length && basis.every(b => unit((v.targetProbabilities as Record<string, unknown>)[b]))
    && Math.abs((Object.values(v.targetProbabilities) as number[]).reduce((a, b) => a + b, 0) - 1) < 1e-10;
}

/** Shape, physics, and snapshot binding guard the wire boundary; the server awards scores. */
export function validGrade(v: unknown, challengeId: string, snapshot: SimulationRequest, submissionId: string): v is Grade {
  if (!record(v) || v.challengeId !== challengeId || v.challengeVersion !== 1 || v.submissionId !== submissionId
    || !validCircuitDraft(v.circuit) || circuitKey(v.circuit) !== circuitKey(snapshot)
    || typeof v.circuitDigest !== 'string' || !/^[a-f0-9]{64}$/.test(v.circuitDigest)
    || typeof v.valid !== 'boolean' || typeof v.targetAchieved !== 'boolean' || !Number.isInteger(v.score) || !finite(v.score) || v.score < 0 || v.score > 100
    || !['state', 'distribution'].includes(String(v.criterion)) || !strings(v.violatedConstraints)
    || v.valid !== (v.violatedConstraints.length === 0) || typeof v.feedback !== 'string'
    || !(v.nextHint === null || typeof v.nextHint === 'string') || !(v.inspectStep === null || (Number.isInteger(v.inspectStep) && finite(v.inspectStep) && v.inspectStep >= 0 && v.inspectStep <= snapshot.gates.length))
    || v.engine !== 'qiskit-aer-statevector' || v.bitOrder !== 'q[n-1]...q[0]' || v.samplingUsedForGrading !== false) return false;
  if (v.metrics === null) return !v.valid && !v.targetAchieved && v.score === 0 && v.statevector === null && v.probabilities === null;
  const m = v.metrics;
  if (!record(m) || !unit(m.similarity) || !unit(m.totalVariationDistance) || !finite(m.stateNorm) || Math.abs(m.stateNorm - 1) > 1e-10 || m.tolerance !== 1e-10
    || (v.criterion === 'state' ? !unit(m.fidelity) || m.similarity !== m.fidelity : m.fidelity !== null || Math.abs(m.similarity - (1 - m.totalVariationDistance)) > 1e-12)
    || v.targetAchieved !== (1 - m.similarity <= m.tolerance)
    || (v.score === 100) !== (v.valid && v.targetAchieved) || (!v.valid && v.score !== 0)) return false;
  return physical(v.statevector, v.probabilities, snapshot.numQubits);
}

async function request(url: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'omit',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([signal, timeout]) });
    let data: unknown;
    try { data = JSON.parse(await response.text()); } catch { /* The proxy may return plain text. */ }
    if (!response.ok) {
      if (response.status === 422 && record(data) && Array.isArray(data.detail)) {
        throw new Error('Circuit validation failed. ' + data.detail.flatMap(d => record(d) && typeof d.msg === 'string' ? [d.msg] : []).join(' '));
      }
      throw new Error(`Challenge service unavailable (HTTP ${response.status}). Your circuit is safe. Please retry.`);
    }
    return data;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timeout.aborted) throw new Error('Grading timed out after 15 seconds. Your circuit is safe. Please retry.');
    if (error instanceof TypeError) throw new Error('Challenge service unavailable. Check the backend connection and retry.');
    throw error;
  }
}
export async function submitCircuit(challenge: Challenge, snapshot: SimulationRequest, submissionId: string, signal: AbortSignal) {
  const body = await request('/api/challenges/grade', signal, { challengeId: challenge.id, submissionId, circuit: snapshot });
  if (!validGrade(body, challenge.id, snapshot, submissionId) || body.criterion !== challenge.criterion) throw new Error('The grading response did not match this submission. No progress was awarded. Please retry.');
  return body;
}

let cached: Challenge[] | null = null;
export function useCatalog() {
  const [catalog, setCatalog] = useState(cached);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (cached) { setCatalog(cached); return; }
    const controller = new AbortController();
    setError(null);
    void request('/api/challenges', controller.signal).then(data => {
      if (!Array.isArray(data) || !data.length || !data.every(validChallenge) || new Set(data.map(c => c.id)).size !== data.length) throw new Error('The challenge catalog could not be validated. Please retry.');
      if (!controller.signal.aborted) { cached = data; setCatalog(data); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load challenges.'); });
    return () => controller.abort();
  }, [retry]);
  return { catalog, error, retry: () => setRetry(n => n + 1) };
}
