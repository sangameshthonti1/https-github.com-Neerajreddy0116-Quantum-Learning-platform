import type { Experiment } from '../lesson/lessonState';
import { getExperiment, isFoundationId } from '../lesson/foundations/content';
import type { FoundationId } from '../lesson/foundations/types';

export type WorkspaceExperiment = Experiment | `${FoundationId}:${string}`;
export function foundationWorkspace(key: WorkspaceExperiment | null) {
  if (key?.split(':').length !== 2) return null;
  const [id, experiment] = (key ?? '').split(':');
  return id && isFoundationId(id) && experiment && getExperiment(id, experiment) ? { id, experiment } : null;
}
let active: WorkspaceExperiment | null = null;
try {
  const saved = sessionStorage.getItem('qlp-active-workspace-v1');
  if (saved === 'h' || saved === 'hh') active = saved;
  else if (saved && foundationWorkspace(saved as WorkspaceExperiment)) active = saved as WorkspaceExperiment;
} catch { /* Keep navigation available without storage. */ }
export function workspaceExperiment(search: string): WorkspaceExperiment | null {
  const params = new URLSearchParams(search);
  const experiment = params.get('experiment');
  if (params.get('workspace') === 'free') return null;
  const lesson = params.get('lesson');
  if (lesson && isFoundationId(lesson) && experiment && getExperiment(lesson, experiment)) return `${lesson}:${experiment}`;
  // A malformed explicit exercise must not silently open a different lesson.
  if (lesson && !(lesson === 'superposition' && (experiment === 'h' || experiment === 'hh'))) return null;
  return params.get('lesson') === 'superposition' && (experiment === 'h' || experiment === 'hh') ? experiment : active;
}
export function rememberWorkspace(experiment: WorkspaceExperiment | null) {
  active = experiment;
  try { sessionStorage.setItem('qlp-active-workspace-v1', experiment ?? 'free'); } catch { /* In-memory fallback. */ }
}
