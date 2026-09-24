import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { askTutor } from '../api/tutorClient';
import { validCircuitDraft } from '../lab/useCircuitEditor';
import type { CircuitFacts, TutorContext, TutorRequest, TutorResponse } from './types';

interface Turn { id: number; question: string; contextKey: string; label: string; response?: TutorResponse }
const lessonQuestions = {
  measurement: ['What is a qubit? Explain it without physics knowledge.', 'What does one measurement tell me?', 'How are probabilities different from counts?'],
  superposition: ['Why does H give 50% and 50%?', 'Why did H followed by H return to zero?', 'What does the imaginary part of an amplitude mean?'],
  phase: ['How can two states have the same probabilities?', 'What is the difference between relative and global phase?', 'Why does H → Z → H give one?'],
  entanglement: ["Why are the Bell state's Bloch vectors at the center?", 'What does |01⟩ mean?', 'How can I build a Bell state from an empty circuit?'],
};
const genericQuestions = [
  'Explain a core quantum computing idea in beginner-friendly words.',
  'What should I learn or try next?',
  'How do quantum circuits help us understand algorithms?',
];
const number = (n: number) => (Math.abs(n) < 1e-10 ? 0 : n).toFixed(3).replace(/\.?0+$/, '') || '0';

function Facts({ facts }: { facts: CircuitFacts }) {
  const step = facts.snapshots.find((s) => s.index === facts.selectedStep)!;
  return <details className="tutor-facts"><summary>Verified by Qiskit · step {step.index}</summary>
    <p>Ideal state before measurement · q[n-1]...q[0]. No sampled counts.</p>
    <dl>{Object.entries(step.probabilities).sort(([a], [b]) => a.localeCompare(b)).map(([label, p]) => <div key={label}><dt>|{label}⟩</dt><dd>{number(p * 100)}%</dd></div>)}</dl>
    <p className="tutor-fact-vectors">{step.qubits.map((q) => `q${q.qubit} Bloch: (${number(q.blochVector.x)}, ${number(q.blochVector.y)}, ${number(q.blochVector.z)})`).join(' · ')}</p>
    <small>These values are calculated by the backend, independently of the AI explanation. Open State Explorer for the full state.</small>
  </details>;
}

export default function TutorPanel({ context, open, onClose }: { context: TutorContext; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const currentKey = useRef(context.key);
  currentKey.current = context.key;
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<{ request: TutorRequest; id: number; key: string } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  function cancel(message = 'Request cancelled. No answer was added. You can retry. Provider processing may already have started.') {
    active.current?.abort(); active.current = null; setLoading(false); setNotice(message);
  }
  useLayoutEffect(() => {
    active.current?.abort(); active.current = null; setLoading(false); setError(null); setRetry(null); setPreview(null);
    setNotice('');
  }, [context.key]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!open) { node.close(); return; }
    node.showModal();
    input.current?.focus();
    return () => { node.close(); };
  }, [open]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [turns, loading, error, notice]);

  async function send(request: TutorRequest, id: number, key: string) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(null); setNotice(''); setRetry({ request, id, key });
    try {
      const response = await askTutor(request, controller.signal);
      if (active.current === controller && !controller.signal.aborted && currentKey.current === key) {
        setTurns((all) => all.map((turn) => turn.id === id ? { ...turn, response } : turn)); setRetry(null);
      }
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted && currentKey.current === key) setError(cause instanceof Error ? cause.message : 'AI Tutor unavailable. Please retry.');
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }
  function ask(question = draft) {
    if (!question.trim() || question.length > 2000 || active.current) return;
    const id = ++serial.current;
    // Context changes never smuggle old circuit claims into the next request.
    const history = turns.filter((turn) => turn.contextKey === context.key && turn.response).slice(-2).flatMap((turn) => [
      { role: 'user' as const, content: turn.question.slice(0, 2000) },
      { role: 'assistant' as const, content: turn.response!.answer.slice(0, 2000) },
    ]);
    const request: TutorRequest = { question: question.trim(), mode: context.circuit ? 'circuit' : 'learn', lessonId: context.lessonId, circuit: context.circuit ? structuredClone(context.circuit) : null, selectedStep: context.selectedStep, history };
    setTurns((all) => [...all.slice(-11), { id, question: request.question, contextKey: context.key, label: context.label }]);
    setDraft(''); setPreview(null); input.current?.focus(); void send(request, id, context.key);
  }
  const questions = context.circuit
    ? [context.circuit.gates.length ? 'What is wrong with my circuit?' : 'How can I build a Bell state from an empty circuit?', 'Explain the gates and what changes at this step.', ...(context.lessonId ? lessonQuestions[context.lessonId].slice(0, 1) : ['Why does H give 50% and 50%?'])]
    : context.lessonId ? lessonQuestions[context.lessonId] : genericQuestions;

  return <dialog className="tutor-panel" ref={dialog} aria-labelledby="tutor-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, summary, a[href]')].filter((element) => element.checkVisibility());
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="tutor-header"><div className="tutor-mark" aria-hidden="true">✦</div><div><h2 id="tutor-title">AI Tutor</h2><p>A little clarity, one question at a time.</p></div><button className="q-icon-button" aria-label="Close AI Tutor" onClick={onClose}>×</button></header>
    <div className="tutor-context"><span>DISCUSSING</span><p data-testid="tutor-context">{context.label}</p></div>
    <div className="tutor-conversation" ref={scroll}>
      {!turns.length && <section className="tutor-welcome"><span className="tutor-welcome-symbol" aria-hidden="true">|ψ⟩</span><h3>Let’s make quantum feel understandable.</h3><p>Ask in your own words. We can unpack an idea, follow a gate’s effect, or plan your next circuit together.</p><p className="tutor-small">Circuit facts are checked with Qiskit. AI explanations can make mistakes; use the verified facts to check numerical claims.</p><div className="tutor-prompts">{questions.map((q) => <button key={q} onClick={() => ask(q)} disabled={loading}>{q}<span aria-hidden="true">↗</span></button>)}</div></section>}
      <div role="log" aria-label="Tutor conversation" aria-live="polite" aria-relevant="additions text">{turns.map((turn) => <article className="tutor-turn" key={turn.id}>
        <p className="tutor-turn-context">{turn.contextKey !== context.key ? 'Earlier context · ' : ''}{turn.label}</p>
        <div className="tutor-question"><span>You</span><p>{turn.question}</p></div>
        {turn.response && <div className="tutor-answer"><span className="tutor-answer-label">✦ AI explanation</span><p className="tutor-prose">{turn.response.answer}</p>
          {turn.response.facts && <p className="tutor-small">AI text can be mistaken. Qiskit facts below are the source for circuit values.</p>}
          {turn.response.deeper && <details className="tutor-deeper"><summary>Go a little deeper</summary><p className="tutor-prose">{turn.response.deeper}</p></details>}
          {turn.response.facts && <Facts facts={turn.response.facts} />}
          {turn.response.followUp && <p className="tutor-follow-up">{turn.response.followUp}</p>}
          {turn.response.suggestion && <section className="tutor-suggestion" aria-label="Circuit suggestion"><span>PROPOSED CIRCUIT</span><h3>{turn.response.suggestion.title}</h3><p>{turn.response.suggestion.rationale}</p>
            {applied === turn.id && <p role="status">Applied to the Lab. Undo restores your previous circuit.</p>}
            <button className="q-button q-button-secondary" onClick={() => setPreview(preview === turn.id ? null : turn.id)} aria-expanded={preview === turn.id}>Preview circuit</button>
            {preview === turn.id && <div className="tutor-preview"><p>{turn.response.suggestion.circuit.numQubits} qubits · {turn.response.suggestion.circuit.gates.length} gates</p><ol>{turn.response.suggestion.circuit.gates.map((gate) => <li key={gate.id}>{gate.type.toUpperCase()} · {gate.type === 'cx' ? `control q${gate.controls[0]} → ` : ''}target q{gate.targets[0]}</li>)}</ol>
              {!turn.response.suggestion.circuit.gates.length && <p>Empty circuit; all qubits start in zero.</p>}
              <Facts facts={turn.response.suggestion.facts} />
              {context.apply ? <><p>This replaces all gates and qubits in the current workspace. You can Undo in the Lab. It does not run or collect an experiment.</p><button className="q-button q-button-primary" disabled={turn.contextKey !== context.key || applied === turn.id || loading} onClick={() => {
                const suggestion = turn.response?.suggestion;
                if (turn.contextKey !== currentKey.current || !suggestion || !validCircuitDraft(suggestion.circuit)) return;
                context.apply?.(structuredClone(suggestion.circuit)); setApplied(turn.id); setNotice('Circuit applied. Close the tutor to explore it; Undo restores your previous circuit.');
              }}>{applied === turn.id ? 'Applied to Lab' : 'Confirm replacement'}</button>{turn.contextKey !== context.key && <p>Context changed. Ask again about the current circuit before applying a suggestion.</p>}</>
                : <p>To apply a proposal, open Circuit Lab and ask the tutor there. Lesson progress is unaffected.</p>}
            </div>}
          </section>}
        </div>}
      </article>)}</div>
      {loading && <div className="tutor-loading" role="status"><span aria-hidden="true" />Checking context and preparing an explanation…</div>}
      {error && <div className="tutor-error" role="alert"><strong>We couldn’t get an AI answer</strong><p>{error}</p>{/not configured/i.test(error) && <p>No answer was fabricated. An administrator must enable the AI provider for this server.</p>}</div>}
      {notice && <p className="tutor-small" role="status">{notice}</p>}
      {!loading && retry && retry.key === context.key && <button className="q-button q-button-secondary" onClick={() => void send(retry.request, retry.id, retry.key)}>Retry question</button>}
    </div>
    <form className="tutor-compose" onSubmit={(event) => { event.preventDefault(); ask(); }}>
      <label htmlFor="tutor-question">Your question</label><textarea ref={input} id="tutor-question" value={draft} maxLength={2000} rows={3} placeholder="What would you like to understand?" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); }
      }} aria-describedby="tutor-privacy" />
      <div className="tutor-compose-actions"><button type="button" className="tutor-clear" disabled={!turns.length && !draft} onClick={() => { cancel('Conversation cleared.'); setTurns([]); setDraft(''); setRetry(null); setError(null); setPreview(null); input.current?.focus(); }}>Clear conversation</button><span>{draft.length}/2000</span>
        {loading ? <button type="button" className="q-button q-button-secondary" onClick={() => cancel()}>Cancel request</button> : <button className="q-button q-button-primary" type="submit" disabled={!draft.trim()}>Send <span aria-hidden="true">↑</span></button>}
      </div><p id="tutor-privacy">Temporary conversation · no saved history. Last 12 turns shown; up to 2 recent exchanges for this context go to OpenAI when enabled. Don’t include private information.</p>
    </form>
  </dialog>;
}
