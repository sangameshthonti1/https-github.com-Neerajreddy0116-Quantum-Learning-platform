import type { SimulationRequest } from './types';
import { validCircuitDraft } from '../lab/useCircuitEditor';

export interface CodeDiagnostic { line: number; column: number; message: string; code: string }
export class CodeValidationError extends Error {
  constructor(public diagnostics: CodeDiagnostic[]) { super(diagnostics[0]?.message ?? 'Invalid circuit code.'); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function parseCircuitCode(source: string, settings: SimulationRequest, signal: AbortSignal): Promise<SimulationRequest> {
  const timeout = AbortSignal.timeout(15_000);
  try {
    const response = await fetch('/api/circuits/parse', { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ source, shots: settings.shots, seedSimulator: settings.seedSimulator ?? null }),
      signal: AbortSignal.any([signal, timeout]),
    });
    let body: unknown;
    try { body = await response.json(); } catch { /* Local proxy errors can be text. */ }
    if (!response.ok && record(body) && Array.isArray(body.diagnostics)) {
      const diagnostics = body.diagnostics.filter((d): d is CodeDiagnostic => record(d)
        && Number.isInteger(d.line) && Number(d.line) >= 1 && Number.isInteger(d.column) && Number(d.column) >= 1
        && typeof d.message === 'string' && typeof d.code === 'string');
      if (diagnostics.length) throw new CodeValidationError(diagnostics);
    }
    if (!response.ok) throw new Error(`Code validation is unavailable (HTTP ${response.status}). Check the local backend and retry. Your circuit is unchanged.`);
    if (!record(body) || !validCircuitDraft(body.circuit) || body.circuit.shots !== settings.shots
      || (body.circuit.seedSimulator ?? null) !== (settings.seedSimulator ?? null)) throw new Error('The parser returned an invalid circuit. Your circuit is unchanged.');
    return body.circuit;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Code validation cancelled.', 'AbortError');
    if (timeout.aborted) throw new Error('Code validation timed out. Your circuit is unchanged; retry when the backend is ready.');
    if (error instanceof TypeError) throw new Error('Cannot reach the local code validator. Check the backend and retry. Your circuit is unchanged.');
    throw error;
  }
}
