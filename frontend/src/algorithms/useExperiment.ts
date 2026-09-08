import { useLayoutEffect, useRef, useState } from 'react';
import { buildAlgorithm, parameterKey, runAlgorithm, validParameters } from './api';
import type { AlgorithmDefinition, AlgorithmId, AlgorithmParameters, AlgorithmRun } from './types';

interface Session { parameters: AlgorithmParameters; result: AlgorithmRun | null; prediction?: number; answer?: number }
const sessions = new Map<AlgorithmId, Session>();
function initial(id: AlgorithmId): Session {
  const existing = sessions.get(id);
  if (existing) return existing;
  let parameters: AlgorithmParameters = id === 'deutsch-jozsa'
    ? { algorithm: id, inputQubits: 2, oracleId: 'zero', shots: 1024, seedSimulator: 42 }
    : { algorithm: id, numQubits: 2, markedItem: '10', iterations: 1, shots: 1024, seedSimulator: 42 };
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(`qlp-algorithm-selection-${id}`) ?? 'null');
    if (validParameters(saved) && saved.algorithm === id) parameters = saved;
  } catch { /* Opening remains available without browser storage. */ }
  return { parameters, result: null };
}
export function useExperiment(id: AlgorithmId) {
  const [session, setSession] = useState(() => initial(id));
  const [definition, setDefinition] = useState<AlgorithmDefinition | null>(session.result?.definition ?? null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(!definition);
  const [invalidated, setInvalidated] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const key = parameterKey(session.parameters);
  useLayoutEffect(() => {
    sessions.set(id, session);
    try { sessionStorage.setItem(`qlp-algorithm-selection-${id}`, JSON.stringify(session.parameters)); } catch { /* Memory retains selections. */ }
  }, [id, session]);
  useLayoutEffect(() => {
    const controller = new AbortController();
    setBuilding(true); setBuildError(null);
    void buildAlgorithm(session.parameters, controller.signal).then(data => {
      if (!controller.signal.aborted) { setDefinition(data); setBuilding(false); }
    }).catch(e => { if (!controller.signal.aborted) { setDefinition(null); setBuilding(false); setBuildError(e instanceof Error ? e.message : 'Unable to build the circuit.'); } });
    return () => controller.abort();
    // key includes every parameter; answers and results do not rebuild a circuit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);
  useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  function change(parameters: AlgorithmParameters) {
    if (parameterKey(parameters) === key) return;
    active.current?.abort(); active.current = null;
    setInvalidated(!!session.result || loading || invalidated);
    setLoading(false); setRunError(null); setDefinition(null); setBuilding(true);
    setSession({ parameters, result: null });
  }
  async function run() {
    if (!definition || building || active.current || parameterKey(definition.parameters) !== key) return;
    const controller = new AbortController(); active.current = controller;
    const snapshot = structuredClone(definition);
    setLoading(true); setRunError(null); setSession(s => ({ ...s, result: null }));
    try {
      const result = await runAlgorithm(snapshot, controller.signal);
      if (active.current === controller && !controller.signal.aborted) {
        setSession(s => parameterKey(s.parameters) === parameterKey(snapshot.parameters) ? { ...s, result } : s);
        setInvalidated(false);
      }
    } catch (e) {
      if (active.current === controller && !controller.signal.aborted) setRunError(e instanceof Error ? e.message : 'Unable to run the algorithm.');
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }
  return { ...session, definition, building, loading, buildError, runError, invalidated, change, run,
    retryBuild: () => setRevision(n => n + 1),
    predict: (prediction: number) => setSession(s => ({ ...s, prediction })),
    answer: (answer: number) => setSession(s => ({ ...s, answer })), submittedAnswer: session.answer };
}
