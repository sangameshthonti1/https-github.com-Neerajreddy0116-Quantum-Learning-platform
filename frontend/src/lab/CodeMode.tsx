import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { SimulationRequest } from '../api/types';
import { CodeValidationError, parseCircuitCode, type CodeDiagnostic } from '../api/codeClient';
import { circuitKey } from './useCircuitEditor';
import { codeTemplates, MAX_CODE_LENGTH, reconcileGateIds, toOpenQasm, toQiskitPython } from './circuitCode';

interface Draft { source: string; base: string }
const drafts = new Map<string, Draft | null>();
function restore(key: string): Draft | null {
  if (drafts.has(key)) return drafts.get(key)!;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object' && 'source' in value && 'base' in value
      && typeof value.source === 'string' && value.source.length <= MAX_CODE_LENGTH
      && typeof value.base === 'string' && value.base.length <= 65536) return { source: value.source, base: value.base };
  } catch { /* Storage must never prevent editing. */ }
  return null;
}

export default function CodeMode({ request, workspaceKey, onApply }: {
  request: SimulationRequest; workspaceKey: string; onApply: (request: SimulationRequest) => void;
}) {
  const storageKey = `qlp-code-${workspaceKey}-v1`;
  const [draft, setDraft] = useState<Draft | null>(() => restore(storageKey));
  const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const active = useRef<AbortController | null>(null);
  const helpId = useId();
  const errorId = useId();
  const key = circuitKey(request);
  // Simulator choice does not alter OpenQASM. Keep pending code across switches,
  // while the full request key still cancels a parser response for the old backend.
  const codeKey = circuitKey({ ...request, backend: 'qiskit' });
  const source = draft?.source ?? toOpenQasm(request);
  const conflict = draft !== null && draft.base !== codeKey;
  useLayoutEffect(() => {
    if (active.current) { active.current.abort(); active.current = null; setBusy(false); }
    setDiagnostics([]); setFailed(false); setMessage('');
  }, [source, key]);
  useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useLayoutEffect(() => {
    drafts.set(storageKey, draft);
    try {
      if (draft) sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The in-memory draft also survives client navigation. */ }
  }, [draft, storageKey]);

  function change(text: string) {
    active.current?.abort(); active.current = null; setBusy(false);
    if (text.length > MAX_CODE_LENGTH) {
      setDiagnostics([]); setFailed(true);
      setMessage(`Code was not inserted: the limit is ${MAX_CODE_LENGTH.toLocaleString()} characters. Your previous code and circuit are unchanged.`);
      return;
    }
    setDraft({ source: text, base: draft?.base ?? codeKey });
    setDiagnostics([]); setFailed(false); setMessage('');
  }
  function discard() {
    active.current?.abort(); active.current = null; setBusy(false);
    setDraft(null); setDiagnostics([]); setFailed(false); setMessage('');
  }
  async function validate(apply: boolean) {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setDiagnostics([]); setFailed(false); setMessage('');
    const snapshot = structuredClone(request);
    try {
      const parsed = await parseCircuitCode(source, snapshot, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      if (apply) {
        onApply({ ...snapshot, numQubits: parsed.numQubits, gates: reconcileGateIds(snapshot.gates, parsed.gates) });
        setDraft(null);
      } else setMessage(`Valid: ${parsed.numQubits} qubits and ${parsed.gates.length} gates. Apply code to update the circuit.`);
    } catch (error) {
      if (active.current !== controller || controller.signal.aborted) return;
      setFailed(true);
      if (error instanceof CodeValidationError) setDiagnostics(error.diagnostics);
      else setMessage(error instanceof Error ? error.message : 'Validation failed. Your circuit is unchanged.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  function focusError(diagnostic: CodeDiagnostic) {
    const lines = source.split('\n');
    const offset = lines.slice(0, diagnostic.line - 1).reduce((total, line) => total + line.length + 1, 0) + diagnostic.column - 1;
    editor.current?.focus(); editor.current?.setSelectionRange(offset, Math.min(offset + 1, source.length));
  }

  return <section className="lab-code" aria-label="Circuit code editor">
    <header className="lab-code-heading"><div><h2>Circuit code</h2><p>OpenQASM 3 · supported subset</p></div>
      <span className="lab-chip" role="status">{busy ? 'Validating…' : draft ? 'Unapplied code edits' : 'Code matches the applied circuit'}</span></header>
    <p id={helpId}>Declare wires with <code>qubit[2] q;</code>. Then write one gate per statement: <code>h q[0];</code>.
      For controlled gates, list controls first and the target last. Angles such as <code>ry(pi/2) q[0];</code> use radians.</p>
    <label className="lab-code-template">Start from an example<select aria-label="Code template" value="" onChange={(event) => {
      const template = codeTemplates[event.target.value as keyof typeof codeTemplates];
      if (template) change(template.source);
    }}><option value="" disabled>Choose a code example…</option>{Object.entries(codeTemplates).map(([id, template]) => <option key={id} value={id}>{template.label}</option>)}</select></label>
    <label className="lab-code-label">OpenQASM source<textarea ref={editor} aria-label="OpenQASM source" aria-describedby={`${helpId} ${errorId}`}
      aria-invalid={failed} value={source} onChange={(event) => change(event.target.value)}
      rows={12} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" /></label>
    <div className="lab-code-meta"><span>{source.length.toLocaleString()} / {MAX_CODE_LENGTH.toLocaleString()} characters</span><span>Tab moves to the next control.</span></div>
    <div id={errorId} aria-live="polite">
      {diagnostics.length > 0 && <div className="lab-notice" role="alert"><p>Your circuit has not changed.</p>{diagnostics.map((diagnostic, index) => <p key={index}>
        <button type="button" onClick={() => focusError(diagnostic)}>Line {diagnostic.line}, column {diagnostic.column}</button> {diagnostic.message}
      </p>)}</div>}
      {message && <p className="lab-notice" role={failed ? 'alert' : 'status'}>{message}</p>}
    </div>
    {conflict && <p className="lab-notice" role="status">The applied circuit changed while this code draft was pending. Review the canvas before replacing it, or discard your code edits.</p>}
    <div className="lab-actions">
      <button className="lab-primary" onClick={() => void validate(true)} disabled={busy || !draft}>{conflict ? 'Replace circuit with draft' : 'Apply code'}</button>
      <button onClick={() => void validate(false)} disabled={busy}>Validate code</button>
      <button onClick={discard} disabled={!draft}>Discard code edits</button>
    </div>
    <p className="lab-muted">Apply updates the canvas in one undoable edit. Run Simulation and Explore steps always use the applied circuit. Examples replace only the code draft until you apply.</p>
    <details><summary>Supported syntax & phase conventions</summary>
      <p>Required: <code>OPENQASM 3.0;</code>, <code>include "stdgates.inc";</code>, and one register named q with 1–3 qubits. The library declaration is built in; no files are loaded.</p>
      <p>Gates: h, x, y, z, s, sdg (S†), t, tdg (T†), rx, ry, rz, p, cx, cz, swap, ccx. Up to 256 gate statements. Use semicolons and <code>//</code> comments.</p>
      <p>Angles: decimal numbers, scientific notation, pi, +, −, *, / and parentheses; at most 64 expression tokens and 16 nested levels. No variables, functions, loops, custom gates, external includes, reset, or explicit measurements.</p>
      <p>π radians is a half turn; 2π is a full turn. P(θ) and RZ(θ) differ by a global phase exp(iθ/2). A shared global phase does not affect observations; a relative phase between amplitudes can affect interference. The simulator preserves native phases.</p>
      <p>Qubit 0 is the rightmost bit in outcome labels. All qubits start at zero. Run Simulation adds terminal measurements; the code describes the state before those measurements.</p>
    </details>
    <details><summary>Qiskit Python example · read only</summary><p>This example describes the applied circuit. Python editing and arbitrary Python execution are not supported.</p>
      <pre aria-label="Read-only Qiskit Python example">{toQiskitPython(request)}</pre></details>
  </section>;
}
