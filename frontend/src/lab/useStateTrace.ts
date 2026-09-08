import { useLayoutEffect, useRef, useState } from 'react';
import type { SimulationRequest, TraceResponse } from '../api/types';
import { traceCircuit } from '../api/traceClient';
import { circuitKey } from './useCircuitEditor';

export interface TraceSnapshot { request: SimulationRequest; response: TraceResponse; rawResponse: string }

export function useStateTrace(request: SimulationRequest) {
  const [snapshot, setSnapshot] = useState<TraceSnapshot | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const active = useRef<AbortController | null>(null);
  const key = circuitKey(request);
  // Runs before interactions with the new circuit can start another request.
  useLayoutEffect(() => {
    if (active.current) {
      active.current.abort(); active.current = null;
      setLoading(false); setCancelled(true);
    }
    setError(null);
  }, [key]);
  useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const stale = snapshot !== null && circuitKey(snapshot.request) !== key;
  const step = !stale && !loading && !error && !cancelled && snapshot ? snapshot.response.steps[index] ?? null : null;

  async function run() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const sent = structuredClone(request);
    setLoading(true); setError(null); setCancelled(false);
    try {
      const result = await traceCircuit(sent, controller.signal);
      if (active.current === controller && !controller.signal.aborted) {
        setSnapshot({ request: sent, ...result }); setIndex(0);
      }
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Trace failed. Please retry.');
        setSnapshot(null);
      }
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }
  return { snapshot, index, setIndex, step, stale, loading, error, cancelled, run };
}
