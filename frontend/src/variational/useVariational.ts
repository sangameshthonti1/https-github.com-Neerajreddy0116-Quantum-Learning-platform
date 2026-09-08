import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { Catalog, Definition, ExperimentRequest, Job, VariationalId } from './types';

const message = (e: unknown) => e instanceof Error ? e.message : 'The optimization service could not complete this request.';
const saved = (id: VariationalId): ExperimentRequest => {
  try { const v: unknown = JSON.parse(sessionStorage.getItem(`qlp-variational-v1-${id}`) ?? 'null');
    if (api.validRequest(v) && v.algorithm === id) return v;
  } catch { /* Invalid selections never replace a circuit draft. */ }
  return api.defaults(id);
};
interface Active { id: string; request: ExperimentRequest; controller: AbortController; started: Promise<Job> }
const abandon = (active: Active) => {
  active.controller.abort();
  // Known ID before POST: cancel now AND after acceptance if the response was late.
  void api.job(active.request, active.id, 'DELETE').catch(() => {});
  void active.started.then(() => api.job(active.request, active.id, 'DELETE')).catch(() => {});
};
export function useVariational(id: VariationalId) {
  const [request, setRequest] = useState(() => saved(id));
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [building, setBuilding] = useState(true), [busy, setBusy] = useState(false), [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null), [buildError, setBuildError] = useState<string | null>(null);
  const [prediction, predict] = useState<number>(), [answer, setAnswer] = useState<number>();
  const [revision, retry] = useState(0), [invalidated, setInvalidated] = useState(false);
  const active = useRef<Active | null>(null), generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); setBuilding(true); setBuildError(null); setDefinition(null);
    // Independent catalog and preview requests start together.
    void Promise.all([api.catalog(controller.signal), api.build(request, controller.signal)]).then(([c, d]) => {
      if (!controller.signal.aborted) { setCatalog(c); setDefinition(d); }
    }).catch(e => { if (!controller.signal.aborted) setBuildError(message(e)); })
      .finally(() => { if (!controller.signal.aborted) setBuilding(false); });
    return () => controller.abort();
  }, [request, revision]);
  useEffect(() => {
    const cleanup = () => { generation.current++; const old = active.current; active.current = null; if (old) abandon(old); };
    window.addEventListener('pagehide', cleanup);
    return () => { window.removeEventListener('pagehide', cleanup); cleanup(); };
  }, []);
  const change = (next: ExperimentRequest) => {
    generation.current++;
    const old = active.current; active.current = null; if (old) abandon(old);
    setRequest(next); setDefinition(null); setBuilding(true); setJob(null); setError(null); setBusy(false); setCancelling(false);
    predict(undefined); setInvalidated(true);
    try { sessionStorage.setItem(`qlp-variational-v1-${id}`, JSON.stringify(next)); } catch { /* Session-local memory fallback. */ }
  };
  const run = async () => {
    if (!definition || busy || building || prediction === undefined) return;
    const token = ++generation.current, jobId = crypto.randomUUID(), controller = new AbortController();
    const own: Active = { id: jobId, request, controller, started: api.job(request, jobId, 'POST') };
    active.current = own; setBusy(true); setError(null); setJob(null); setInvalidated(false);
    const current = () => generation.current === token && active.current === own;
    try {
      let snapshot = await own.started;
      if (!current()) { abandon(own); return; }
      while (current()) {
        setJob(snapshot);
        if (snapshot.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 250));
        if (!current()) return;
        snapshot = await api.job(request, jobId, 'GET', controller.signal);
      }
    } catch (e) {
      // Even an ambiguous POST timeout retains the known cancellation target.
      abandon(own);
      if (current()) setError(message(e));
    } finally {
      if (current()) { active.current = null; setBusy(false); }
    }
  };
  const cancel = async () => {
    const own = active.current;
    if (!own) return;
    const token = ++generation.current; active.current = null; own.controller.abort(); setCancelling(true); setJob(null);
    try {
      await own.started; // Acceptance may still be in flight; don't mistake an early 404 for cleanup.
      const stopped = await api.job(own.request, own.id, 'DELETE');
      if (generation.current === token) setJob(stopped);
    } catch (e) {
      abandon(own);
      if (generation.current === token) setError(`Cancellation could not be confirmed. ${message(e)} The server still enforces the ${own.request.timeLimitSeconds}s deadline.`);
    } finally {
      if (generation.current === token) { setBusy(false); setCancelling(false); }
    }
  };
  return { request, definition, catalog, job, building, busy, cancelling, error, buildError, prediction, predict, answer, setAnswer,
    invalidated, change, run, cancel, retry: () => retry(n => n + 1) };
}
