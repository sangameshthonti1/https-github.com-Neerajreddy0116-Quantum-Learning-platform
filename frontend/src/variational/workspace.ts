import { validDefinition } from './api';
import type { Definition } from './types';

const snapshots = new Map<string, Definition>();
export function openVariationalWorkspace(definition: Definition) {
  const key = `${definition.request.algorithm}:${definition.circuitDigest}`;
  snapshots.set(key, structuredClone(definition));
  try { sessionStorage.setItem(`qlp-variational-source-${key}`, JSON.stringify(definition)); } catch { /* In-memory fallback. */ }
  return `/lab?algorithm=${definition.request.algorithm}&snapshot=${definition.circuitDigest}`;
}
export function variationalWorkspace(search: string) {
  const p = new URLSearchParams(search), id = p.get('algorithm'), digest = p.get('snapshot');
  if (!['vqe', 'qaoa'].includes(id ?? '') || !digest || !/^[a-f0-9]{64}$/.test(digest)) return null;
  const key = `${id}:${digest}`;
  let definition = snapshots.get(key);
  if (!definition) {
    try { const v: unknown = JSON.parse(sessionStorage.getItem(`qlp-variational-source-${key}`) ?? 'null');
      if (validDefinition(v) && v.request.algorithm === id && v.circuitDigest === digest) definition = v;
    } catch { /* Never overwrite the free draft with an invalid snapshot. */ }
  }
  return definition ? { definition, workspaceKey: `variational:${key}`, returnHref: `/algorithms/${id}` } : null;
}
