import type { ComplexAmplitude, SimulationRequest, TraceResponse } from './types';

const tolerance = 1e-10;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
const complex = (v: unknown): v is ComplexAmplitude => record(v) && finite(v.real) && finite(v.imag);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Validate the wire format and snapshot identity before exposing any trace. */
function validTrace(v: unknown, request: SimulationRequest): v is TraceResponse {
  if (!record(v) || v.backend !== 'qiskit' || v.numQubits !== request.numQubits) return false;
  const basis = Array.from({ length: 2 ** request.numQubits }, (_, i) => i.toString(2).padStart(request.numQubits, '0'));
  if (!same(v.basisOrder, basis) || !Array.isArray(v.steps) || v.steps.length !== request.gates.length + 1) return false;
  const m = v.metadata;
  if (!record(m) || m.engine !== 'qiskit.quantum_info.Statevector' || m.method !== 'statevector'
    || m.measurement !== 'terminal-all' || m.statevectorStage !== 'before-measurement' || m.samplingPerformed !== false
    || m.bitOrder !== 'q[n-1]...q[0]' || !same(m.reducedBasisOrder, ['0', '1']) || m.globalPhase !== 'qiskit-native'
    || m.gateCount !== request.gates.length || m.stepCount !== v.steps.length
    || !finite(m.executionTimeMs) || m.executionTimeMs < 0 || typeof m.qiskitVersion !== 'string') return false;
  for (const [index, step] of v.steps.entries()) {
    if (!record(step) || step.index !== index) return false;
    const gate = request.gates[index - 1];
    if (gate ? !record(step.gate) || step.gate.id !== gate.id || step.gate.type !== gate.type
      || !same(step.gate.targets, gate.targets) || !same(step.gate.controls, gate.controls) : step.gate !== null) return false;
    if (!Array.isArray(step.statevector) || step.statevector.length !== basis.length
      || !record(step.probabilities) || Object.keys(step.probabilities).length !== basis.length) return false;
    let sum = 0;
    for (const [i, label] of basis.entries()) {
      const a: unknown = step.statevector[i];
      const p = step.probabilities[label];
      if (!complex(a) || !finite(p) || p < 0 || p > 1 + tolerance || !near(p, a.real ** 2 + a.imag ** 2)) return false;
      sum += p;
    }
    if (!near(sum, 1) || (index === 0 && !near(step.probabilities[basis[0]!] as number, 1))) return false;
    if (!Array.isArray(step.qubits) || step.qubits.length !== request.numQubits) return false;
    for (const [q, reduced] of step.qubits.entries()) {
      if (!record(reduced) || reduced.qubit !== q || !Array.isArray(reduced.densityMatrix)
        || reduced.densityMatrix.length !== 2 || !reduced.densityMatrix.every((row: unknown) => Array.isArray(row) && row.length === 2 && row.every(complex))) return false;
      const rho = reduced.densityMatrix as [[ComplexAmplitude, ComplexAmplitude], [ComplexAmplitude, ComplexAmplitude]];
      const [[a, b], [c, d]] = rho;
      const r = reduced.blochVector;
      if (!record(r) || !finite(r.x) || !finite(r.y) || !finite(r.z)
        || !near(a.imag, 0) || !near(d.imag, 0) || !near(a.real + d.real, 1)
        || !near(b.real, c.real) || !near(b.imag, -c.imag)
        || !near(r.x, 2 * b.real) || !near(r.y, -2 * b.imag) || !near(r.z, a.real - d.real)
        || r.x ** 2 + r.y ** 2 + r.z ** 2 > 1 + tolerance) return false;
    }
  }
  return true;
}

export async function traceCircuit(request: SimulationRequest, signal: AbortSignal): Promise<{ response: TraceResponse; rawResponse: string }> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch('/api/simulate/trace', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit', body: JSON.stringify(request), signal: AbortSignal.any([signal, timeout]),
    });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { /* Proxy failures can have non-JSON bodies. */ }
    if (!response.ok) {
      if (response.status === 422 && record(body) && Array.isArray(body.detail)) {
        const issues = body.detail.flatMap((issue: unknown) => record(issue) && Array.isArray(issue.loc) && typeof issue.msg === 'string'
          ? [`${issue.loc.filter((part: unknown) => typeof part === 'string' || typeof part === 'number').join('.')}: ${issue.msg}`] : []);
        throw new Error(`Request validation failed (HTTP 422). ${issues.join('; ')}`);
      }
      if (record(body) && record(body.error) && body.error.code === 'simulation_failed' && typeof body.error.message === 'string') {
        throw new Error(`Trace failed (HTTP ${response.status}). ${body.error.message}`);
      }
      throw new Error(`Trace API unavailable (HTTP ${response.status}). Check that FastAPI is running, then retry.`);
    }
    if (!validTrace(body, request)) throw new Error('The API response does not match the trace contract. No intermediate states were displayed.');
    return { response: body, rawResponse: text };
  } catch (cause) {
    if (signal.aborted) throw new DOMException('Trace cancelled.', 'AbortError');
    if (timeout.aborted) throw new Error('Trace timed out after 15 seconds. Check the backend, then retry.');
    if (cause instanceof TypeError) throw new Error('Trace API unavailable. Check your connection and the FastAPI server, then retry.');
    throw cause;
  }
}
