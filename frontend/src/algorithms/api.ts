import { useEffect, useState } from 'react';
import { isSimulationResponse } from '../api/client';
import { validTrace } from '../api/traceClient';
import { isSimulatorBackend } from '../api/types';
import { circuitKey, validCircuitDraft } from '../lab/useCircuitEditor';
import type { AlgorithmDefinition, AlgorithmEntry, AlgorithmParameters, AlgorithmRun, OracleDefinition } from './types';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-10;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const parameterKey = (p: AlgorithmParameters) => JSON.stringify(p.algorithm === 'deutsch-jozsa'
  ? [p.algorithm, p.inputQubits, p.oracleId, p.shots, p.seedSimulator, p.backend ?? 'qiskit']
  : [p.algorithm, p.numQubits, p.markedItem, p.iterations, p.shots, p.seedSimulator, p.backend ?? 'qiskit']);
export function validParameters(v: unknown): v is AlgorithmParameters {
  if (!record(v) || (v.backend !== undefined && !isSimulatorBackend(v.backend)) || !integer(v.shots) || v.shots < 1 || v.shots > 8192
    || !(v.seedSimulator === null || (integer(v.seedSimulator) && v.seedSimulator >= 0 && v.seedSimulator <= 4294967295))) return false;
  return v.algorithm === 'deutsch-jozsa'
    ? (v.inputQubits === 1 || v.inputQubits === 2) && (v.inputQubits === 1 ? ['zero', 'one', 'q0', 'not-q0'] : ['zero', 'one', 'q0', 'not-q0', 'q1', 'not-q1', 'xor', 'xnor']).includes(String(v.oracleId))
    : v.algorithm === 'grover' && (v.numQubits === 1 || v.numQubits === 2)
      && typeof v.markedItem === 'string' && /^[01]+$/.test(v.markedItem) && v.markedItem.length === v.numQubits
      && integer(v.iterations) && v.iterations >= 0 && v.iterations <= 4;
}
function validOracle(v: unknown): v is OracleDefinition {
  if (!record(v) || typeof v.label !== 'string' || !validParameters({ algorithm: 'deutsch-jozsa', inputQubits: v.inputQubits, oracleId: v.id, shots: 1, seedSimulator: null })
    || !['constant', 'balanced'].includes(String(v.category)) || !Array.isArray(v.truthTable) || v.truthTable.length !== 2 ** Number(v.inputQubits)) return false;
  const rows = v.truthTable;
  return rows.every((r: unknown, i: number) => record(r) && r.input === i.toString(2).padStart(Number(v.inputQubits), '0') && (r.output === 0 || r.output === 1))
    && (v.category === 'balanced' ? rows.reduce((sum, r) => sum + r.output, 0) === rows.length / 2 : rows.every(r => r.output === rows[0].output));
}
export function validDefinition(v: unknown, parameters?: AlgorithmParameters): v is AlgorithmDefinition {
  if (!record(v) || v.version !== 1 || !validParameters(v.parameters) || (parameters && parameterKey(v.parameters) !== parameterKey(parameters))
    || !validCircuitDraft(v.circuit) || typeof v.circuitDigest !== 'string' || !/^[a-f0-9]{64}$/.test(v.circuitDigest)
    || v.bitOrder !== 'q[n-1]...q[0]' || !Array.isArray(v.stages) || !v.stages.length || v.stages.length > 9) return false;
  const p = v.parameters, c = v.circuit;
  const n = p.algorithm === 'deutsch-jozsa' ? p.inputQubits : p.numQubits;
  if (c.backend !== (p.backend ?? 'qiskit') || c.numQubits !== n + (p.algorithm === 'deutsch-jozsa' ? 1 : 0) || c.shots !== p.shots || c.seedSimulator !== p.seedSimulator
    || !same(v.inputRegister, Array.from({ length: n }, (_, i) => i))
    || (p.algorithm === 'deutsch-jozsa' ? v.ancillaQubit !== n || !validOracle(v.oracle) || v.oracle.id !== p.oracleId || v.oracle.inputQubits !== n : v.ancillaQubit !== null || v.oracle !== null)) return false;
  let end = 0;
  const ids = new Set<string>();
  for (const s of v.stages) {
    if (!record(s) || typeof s.id !== 'string' || ids.has(s.id) || typeof s.title !== 'string' || typeof s.description !== 'string'
      || s.startStep !== end || !integer(s.endStep) || s.endStep < end || s.endStep > c.gates.length
      || !(s.iteration === null || (integer(s.iteration) && s.iteration >= 0 && s.iteration <= 4))) return false;
    end = s.endStep; ids.add(s.id);
  }
  const expectedIds = p.algorithm === 'deutsch-jozsa' ? ['prepare', 'superposition', 'oracle', 'interference']
    : ['superposition', ...Array.from({ length: p.iterations }, (_, k) => [`oracle-${k + 1}`, `diffuser-${k + 1}`]).flat()];
  return end === c.gates.length && same([...ids], expectedIds);
}

/** Validate all displayed scientific data against the bound canonical snapshot. */
export function validRun(v: unknown, definition: AlgorithmDefinition): v is AlgorithmRun {
  if (!record(v) || !validDefinition(v.definition, definition.parameters) || v.definition.circuitDigest !== definition.circuitDigest
    || circuitKey(v.definition.circuit) !== circuitKey(definition.circuit) || !same(v.definition.stages, definition.stages)
    || !isSimulationResponse(v.simulation) || !validTrace(v.trace, definition.circuit)) return false;
  const c = definition.circuit, sim = v.simulation, t = v.trace, m = v.interpretation;
  if (sim.backend !== c.backend || sim.numQubits !== c.numQubits || sim.shots !== c.shots || sim.metadata.gateCount !== c.gates.length
    || (c.seedSimulator !== null && sim.metadata.seedSimulator !== c.seedSimulator)
    || !record(m) || m.algorithm !== definition.parameters.algorithm || m.tolerance !== 1e-10 || typeof m.explanation !== 'string') return false;
  if (!sim.statevector.every((a, i) => near(a.real, t.steps.at(-1)!.statevector[i]!.real) && near(a.imag, t.steps.at(-1)!.statevector[i]!.imag))) return false;
  const p = definition.parameters;
  if (p.algorithm === 'deutsch-jozsa') {
    if (!record(m.inputProbabilities) || !record(m.inputCounts) || Object.keys(m.inputProbabilities).length !== 2 ** p.inputQubits
      || Object.keys(m.inputCounts).length !== 2 ** p.inputQubits || !finite(m.zeroInputProbability) || m.oracleQueries !== 1
      || m.classicalWorstCaseQueries !== 2 ** (p.inputQubits - 1) + 1) return false;
    for (let i = 0; i < 2 ** p.inputQubits; i++) {
      const label = i.toString(2).padStart(p.inputQubits, '0'), probability = m.inputProbabilities[label];
      if (!finite(probability) || !near(probability, sim.probabilities['0' + label]! + sim.probabilities['1' + label]!)
        || m.inputCounts[label] !== sim.counts['0' + label]! + sim.counts['1' + label]!) return false;
    }
    const zero = m.inputProbabilities['0'.repeat(p.inputQubits)] as number;
    return near(m.zeroInputProbability, zero) && m.classification === (near(zero, 1) ? 'constant' : near(zero, 0) ? 'balanced' : 'inconclusive');
  }
  const boundaries = definition.stages.filter(s => s.id === 'superposition' || s.id.startsWith('diffuser-'));
  return m.markedItem === p.markedItem && finite(m.successProbability) && near(m.successProbability, sim.probabilities[p.markedItem]!)
    && m.sampledSuccessCount === sim.counts[p.markedItem] && finite(m.sampledSuccessRate) && near(m.sampledSuccessRate, sim.counts[p.markedItem]! / sim.shots)
    && Array.isArray(m.iterations) && m.iterations.length === boundaries.length
    && m.iterations.every((o: unknown, i: number) => record(o) && o.iteration === i && o.step === boundaries[i]!.endStep
      && finite(o.successProbability) && near(o.successProbability, t.steps[boundaries[i]!.endStep]!.probabilities[p.markedItem]!));
}

async function request(path: string, signal: AbortSignal, body?: AlgorithmParameters): Promise<unknown> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch(`/api/algorithms${path}`, { method: body ? 'POST' : 'GET', credentials: 'omit',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([signal, timeout]) });
    let data: unknown;
    try { data = JSON.parse(await response.text()); } catch { /* Proxy errors may be plain text. */ }
    if (!response.ok) {
      if (response.status === 422 && record(data) && Array.isArray(data.detail)) {
        throw new Error('Request validation failed (HTTP 422). ' + data.detail.flatMap(d => record(d) && typeof d.msg === 'string' ? [d.msg] : []).join(' '));
      }
      throw new Error(`Algorithm service unavailable (HTTP ${response.status}). Check that FastAPI is running, then retry.`);
    }
    return data;
  } catch (e) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timeout.aborted) throw new Error('Algorithm request timed out after 15 seconds. Please retry.');
    if (e instanceof TypeError) throw new Error('Algorithm service unavailable. Check the backend connection and retry.');
    throw e;
  }
}
export async function buildAlgorithm(parameters: AlgorithmParameters, signal: AbortSignal) {
  const data = await request('/build', signal, parameters);
  if (!validDefinition(data, parameters)) throw new Error('The circuit response did not match these parameters. Please retry.');
  return data;
}
export async function runAlgorithm(definition: AlgorithmDefinition, signal: AbortSignal) {
  const data = await request('/run', signal, definition.parameters);
  if (!validRun(data, definition)) throw new Error('The result did not match this circuit and its verified data contract. No results were displayed. Please retry.');
  return data;
}
export function useAlgorithmCatalog() {
  const [catalog, setCatalog] = useState<AlgorithmEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError(null);
    void request('', controller.signal).then(data => {
      if (!Array.isArray(data) || data.length !== 2 || !same(data.map(e => e?.id), ['deutsch-jozsa', 'grover'])
        || !data.every(e => record(e) && typeof e.title === 'string' && typeof e.summary === 'string'
          && same(e.registerSizes, [1, 2]) && Array.isArray(e.oracles) && e.oracles.every(validOracle)
          && (e.id === 'grover' ? e.maxIterations === 4 && e.oracles.length === 0 : e.maxIterations === null && e.oracles.length === 12))) throw new Error('The algorithm catalog could not be validated. Please retry.');
      if (!controller.signal.aborted) setCatalog(data as AlgorithmEntry[]);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load algorithms.'); });
    return () => controller.abort();
  }, [revision]);
  return { catalog, error, retry: () => setRevision(n => n + 1) };
}
