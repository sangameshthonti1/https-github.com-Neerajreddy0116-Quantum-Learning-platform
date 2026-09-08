import type { Experiment } from '../lesson/lessonState';

let active: Experiment | null = null;
try {
  const saved = sessionStorage.getItem('qlp-active-workspace-v1');
  if (saved === 'h' || saved === 'hh') active = saved;
} catch { /* Keep navigation available without storage. */ }
export function workspaceExperiment(search: string): Experiment | null {
  const params = new URLSearchParams(search);
  const experiment = params.get('experiment');
  if (params.get('workspace') === 'free') return null;
  return params.get('lesson') === 'superposition' && (experiment === 'h' || experiment === 'hh') ? experiment : active;
}
export function rememberWorkspace(experiment: Experiment | null) {
  active = experiment;
  try { sessionStorage.setItem('qlp-active-workspace-v1', experiment ?? 'free'); } catch { /* In-memory fallback. */ }
}
