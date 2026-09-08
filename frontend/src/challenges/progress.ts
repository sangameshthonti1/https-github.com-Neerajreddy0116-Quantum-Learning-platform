import { useSyncExternalStore } from 'react';
import type { Grade } from './types';
import { validGrade } from './api';
import { validCircuitDraft } from '../lab/useCircuitEditor';

interface ChallengeRecord { title: string; attempts: number; best: Grade | null; last: Grade | null; completedAt: string | null; hints: number }
type Progress = Record<string, ChallengeRecord>;
const key = 'qlp-challenges-v1';
const empty = (title: string): ChallengeRecord => ({ title, attempts: 0, best: null, last: null, completedAt: null, hints: 0 });
function evidence(v: unknown, id: string): v is Grade {
  if (!v || typeof v !== 'object') return false;
  const g = v as Grade;
  return validCircuitDraft(g.circuit) && typeof g.submissionId === 'string' && validGrade(g, id, g.circuit, g.submissionId);
}
function restore(): Progress {
  const result: Progress = {};
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
    for (const [id, v] of Object.entries(saved)) {
      if (!/^[a-z0-9-]+$/.test(id) || !v || typeof v !== 'object') continue;
      const r = v as ChallengeRecord;
      if (typeof r.title !== 'string' || !Number.isInteger(r.attempts) || r.attempts < 0 || !Number.isInteger(r.hints) || r.hints < 0 || r.hints > 3) continue;
      const best = evidence(r.best, id) ? r.best : null;
      result[id] = { ...empty(r.title), attempts: r.attempts, hints: r.hints, best,
        last: evidence(r.last, id) ? r.last : null,
        completedAt: best?.valid && best.targetAchieved && typeof r.completedAt === 'string' ? r.completedAt : null };
    }
  } catch { /* Corrupt or blocked storage never prevents learning. */ }
  return result;
}
let state = restore();
const listeners = new Set<() => void>();
function update(id: string, title: string, change: (r: ChallengeRecord) => ChallengeRecord) {
  state = { ...state, [id]: change(state[id] ?? empty(title)) };
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Keep the in-memory session. */ }
  listeners.forEach(notify => notify());
}
export function beginAttempt(id: string, title: string) { update(id, title, r => ({ ...r, attempts: r.attempts + 1 })); }
export function revealHint(id: string, title: string) { update(id, title, r => ({ ...r, hints: Math.min(3, r.hints + 1) })); }
/** Called only after the current request returns validated server evidence. */
export function recordGrade(id: string, title: string, grade: Grade) {
  if (!evidence(grade, id)) return;
  update(id, title, r => ({ ...r, last: structuredClone(grade),
    best: !r.best || grade.score > r.best.score ? structuredClone(grade) : r.best,
    completedAt: r.completedAt ?? (grade.valid && grade.targetAchieved ? new Date().toISOString() : null) }));
}
export function useChallengeProgress() {
  return useSyncExternalStore(notify => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => state);
}
