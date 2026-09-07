import type { SimulationRequest, SimulationResponse } from './types';

const endpoint = '/api/simulate';
const timeoutMs = 15_000;
const tolerance = 1e-10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}

/** Check the HTTP boundary rather than trusting a TypeScript cast of arbitrary JSON. */
function isSimulationResponse(value: unknown): value is SimulationResponse {
  if (!isRecord(value) || value.backend !== 'qiskit') return false;
  const { numQubits, probabilities, counts, statevector, shots, metadata } = value;
  if (!nonnegativeInteger(numQubits) || numQubits < 1 || numQubits > 3) return false;
  if (!nonnegativeInteger(shots) || shots < 1 || shots > 8192) return false;
  if (!isRecord(probabilities) || !isRecord(counts) || !Array.isArray(statevector)) return false;
  const size = 2 ** numQubits;
  if (Object.keys(probabilities).length !== size || Object.keys(counts).length !== size || statevector.length !== size) return false;
  let probabilitySum = 0;
  let countSum = 0;
  for (let index = 0; index < size; index += 1) {
    const label = index.toString(2).padStart(numQubits, '0');
    const probability = probabilities[label];
    const count = counts[label];
    const amplitude: unknown = statevector[index];
    if (!finite(probability) || probability < 0 || probability > 1 + tolerance) return false;
    if (!nonnegativeInteger(count)) return false;
    if (!isRecord(amplitude) || !finite(amplitude.real) || !finite(amplitude.imag)) return false;
    if (Math.abs(probability - (amplitude.real ** 2 + amplitude.imag ** 2)) > tolerance) return false;
    probabilitySum += probability;
    countSum += count;
  }
  if (Math.abs(probabilitySum - 1) > tolerance || countSum !== shots) return false;
  return isRecord(metadata)
    && metadata.method === 'statevector'
    && metadata.measurement === 'terminal-all'
    && metadata.statevectorStage === 'before-measurement'
    && metadata.bitOrder === 'q[n-1]...q[0]'
    && nonnegativeInteger(metadata.seedSimulator) && metadata.seedSimulator <= 4294967295
    && nonnegativeInteger(metadata.gateCount)
    && nonnegativeInteger(metadata.circuitDepth)
    && finite(metadata.executionTimeMs) && metadata.executionTimeMs >= 0
    && typeof metadata.qiskitVersion === 'string'
    && typeof metadata.aerVersion === 'string';
}

function httpError(status: number, body: unknown): Error {
  if (status === 422 && isRecord(body) && Array.isArray(body.detail)) {
    const issues = body.detail.flatMap((issue: unknown) => {
      if (!isRecord(issue) || !Array.isArray(issue.loc) || typeof issue.msg !== 'string') return [];
      const location = issue.loc.filter((part: unknown) => typeof part === 'string' || typeof part === 'number').join('.');
      return [`${location || 'request'}: ${issue.msg}`];
    });
    return new Error(`Request validation failed (HTTP 422). ${issues.join('; ') || 'Check the circuit request.'}`);
  }
  if (isRecord(body) && isRecord(body.error) && body.error.code === 'simulation_failed' && typeof body.error.message === 'string') {
    return new Error(`Simulation failed (HTTP ${status}). ${body.error.message}`);
  }
  if (status >= 500) {
    return new Error(`API unavailable (HTTP ${status}). Check that FastAPI is running on the configured proxy target (default 127.0.0.1:8000), then retry.`);
  }
  return new Error(`Simulation request failed (HTTP ${status}). Check the API connection and request contract.`);
}

export async function simulateCircuit(
  request: SimulationRequest,
  signal?: AbortSignal,
): Promise<SimulationResponse> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(request),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    // Keep body reading inside the timeout/cancellation boundary as well.
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      if (!response.ok) throw httpError(response.status, undefined);
      throw new Error('The API returned invalid JSON. Check that the Vite proxy points to the FastAPI backend.');
    }
    if (!response.ok) throw httpError(response.status, body);
    if (!isSimulationResponse(body) || body.numQubits !== request.numQubits || body.shots !== request.shots) {
      throw new Error('The API response does not match the simulation contract. No results were displayed.');
    }
    return body;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Simulation request cancelled.', 'AbortError');
    if (timeout.aborted) throw new Error('Simulation timed out after 15 seconds. Check the backend and retry.');
    if (error instanceof TypeError) {
      throw new Error('API unavailable. Check your connection and that the Vite and FastAPI servers are running, then retry.');
    }
    throw error;
  }
}
