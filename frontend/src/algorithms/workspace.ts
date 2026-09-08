import { validDefinition } from './api';
import type { AlgorithmDefinition } from './types';

const snapshots = new Map<string, AlgorithmDefinition>();
export function openAlgorithmWorkspace(definition: AlgorithmDefinition) {
  const key = `${definition.parameters.algorithm}:${definition.circuitDigest}`;
  snapshots.set(key, structuredClone(definition));
  try { sessionStorage.setItem(`qlp-algorithm-source-${key}`, JSON.stringify(definition)); } catch { /* In-memory fallback. */ }
  return `/lab?algorithm=${definition.parameters.algorithm}&snapshot=${definition.circuitDigest}`;
}
export function algorithmWorkspace(search: string) {
  const params = new URLSearchParams(search), id = params.get('algorithm'), digest = params.get('snapshot');
  if (!['deutsch-jozsa', 'grover'].includes(id ?? '') || !digest || !/^[a-f0-9]{64}$/.test(digest)) return null;
  const key = `${id}:${digest}`;
  let definition = snapshots.get(key);
  if (!definition) {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(`qlp-algorithm-source-${key}`) ?? 'null');
      if (validDefinition(saved) && saved.parameters.algorithm === id && saved.circuitDigest === digest) definition = saved;
    } catch { /* Invalid source never falls back to a free-circuit replacement. */ }
  }
  return definition ? { definition, workspaceKey: `algorithm:${key}`, returnHref: `/algorithms/${id}` } : null;
}
export type AlgorithmWorkspace = NonNullable<ReturnType<typeof algorithmWorkspace>>;
