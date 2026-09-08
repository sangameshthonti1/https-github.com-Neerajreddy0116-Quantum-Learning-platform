import { circuitKey, validCircuitDraft } from '../lab/useCircuitEditor';
import type { CircuitFacts, TutorRequest, TutorResponse } from '../tutor/types';
import type { ComplexAmplitude, SimulationRequest } from './types';

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
const optionalText = (v: unknown, max: number) => v === null || text(v, max);

/** Check computed facts and their request identity before presenting them as facts. */
export function validTutorFacts(v: unknown, request: SimulationRequest, selectedStep: number | null): v is CircuitFacts {
  if (!record(v) || v.source !== 'qiskit-trace' || v.bitOrder !== 'q[n-1]...q[0]' || v.samplingPerformed !== false
    || !validCircuitDraft(v.circuit) || circuitKey(v.circuit) !== circuitKey(request)
    || v.selectedStep !== (selectedStep ?? request.gates.length) || v.totalSteps !== request.gates.length + 1
    || !Array.isArray(v.snapshots) || !v.snapshots.length || v.snapshots.length > 17) return false;
  const indices = new Set<number>();
  for (const step of v.snapshots) {
    if (!record(step) || !Number.isInteger(step.index) || !finite(step.index) || step.index < 0 || step.index > request.gates.length || indices.has(step.index)) return false;
    indices.add(step.index);
    const gate = request.gates[step.index - 1];
    if (gate ? !record(step.gate) || step.gate.id !== gate.id || step.gate.type !== gate.type
      || JSON.stringify(step.gate.targets) !== JSON.stringify(gate.targets) || JSON.stringify(step.gate.controls) !== JSON.stringify(gate.controls) : step.gate !== null) return false;
    if (!record(step.probabilities) || !Array.isArray(step.statevector) || step.statevector.length !== 2 ** request.numQubits
      || Object.keys(step.probabilities).length !== step.statevector.length || !Array.isArray(step.qubits) || step.qubits.length !== request.numQubits) return false;
    let sum = 0;
    for (const [index, amplitude] of step.statevector.entries()) {
      const p = step.probabilities[index.toString(2).padStart(request.numQubits, '0')];
      if (!record(amplitude) || !finite(amplitude.real) || !finite(amplitude.imag) || !finite(p) || p < 0 || p > 1 + 1e-10
        || Math.abs(p - amplitude.real ** 2 - amplitude.imag ** 2) > 1e-10) return false;
      sum += p;
    }
    if (Math.abs(sum - 1) > 1e-10) return false;
    for (const [q, reduced] of step.qubits.entries()) {
      if (!record(reduced) || reduced.qubit !== q || !record(reduced.blochVector)) return false;
      const { x, y, z } = reduced.blochVector;
      if (!finite(x) || !finite(y) || !finite(z) || x * x + y * y + z * z > 1 + 1e-10) return false;
      // Independent basis contraction checks the reduced Bloch values against
      // the verified joint amplitudes, including the complex Y sign and q0 order.
      const amplitudes = step.statevector as ComplexAmplitude[];
      let expectedX = 0, expectedY = 0, expectedZ = 0;
      for (let i = 0; i < amplitudes.length; i++) {
        if (i & (1 << q)) continue;
        const a = amplitudes[i]!, b = amplitudes[i | (1 << q)]!;
        expectedX += 2 * (a.real * b.real + a.imag * b.imag);
        expectedY += 2 * (a.real * b.imag - a.imag * b.real);
        expectedZ += a.real ** 2 + a.imag ** 2 - b.real ** 2 - b.imag ** 2;
      }
      if ([x - expectedX, y - expectedY, z - expectedZ].some((delta) => Math.abs(delta) > 1e-10)) return false;
    }
  }
  return indices.has(v.selectedStep as number) && indices.has(0) && indices.has(request.gates.length);
}

function validResponse(v: unknown, request: TutorRequest): v is TutorResponse {
  if (!record(v) || v.explanationSource !== 'ai' || !text(v.answer, 6000) || !optionalText(v.deeper, 4000)
    || !optionalText(v.followUp, 300) || v.lessonId !== request.lessonId
    || (request.circuit ? !validTutorFacts(v.facts, request.circuit, request.selectedStep) : v.facts !== null)) return false;
  if (v.suggestion === null) return true;
  const s = v.suggestion;
  return record(s) && text(s.title, 100) && text(s.rationale, 600) && validCircuitDraft(s.circuit)
    && s.circuit.gates.length <= 32 && validTutorFacts(s.facts, s.circuit, null);
}

export async function askTutor(request: TutorRequest, signal: AbortSignal): Promise<TutorResponse> {
  const timeout = AbortSignal.timeout(55_000);
  try {
    const response = await fetch('/api/ai/tutor', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit', body: JSON.stringify(request), signal: AbortSignal.any([signal, timeout]),
    });
    const raw = await response.text();
    let body: unknown;
    try { body = JSON.parse(raw); } catch { /* A proxy failure can be plain text. */ }
    if (!response.ok) {
      if (record(body) && record(body.error) && text(body.error.message, 1000)) throw new Error(body.error.message);
      throw new Error(`AI Tutor unavailable (HTTP ${response.status}). Check the backend connection and retry.`);
    }
    if (!validResponse(body, request)) throw new Error('The tutor response failed validation. No answer or circuit change was accepted. Please retry.');
    return body;
  } catch (cause) {
    if (signal.aborted) throw new DOMException('Tutor request cancelled.', 'AbortError');
    if (timeout.aborted) throw new Error('The tutor timed out. Please retry.');
    if (cause instanceof TypeError) throw new Error('AI Tutor unavailable. Check your connection and the backend, then retry.');
    throw cause;
  }
}
