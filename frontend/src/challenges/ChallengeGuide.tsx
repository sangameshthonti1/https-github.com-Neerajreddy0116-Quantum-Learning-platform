import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SimulationRequest } from '../api/types';
import { Link } from '../app/navigation';
import { Badge } from '../app/ui';
import { circuitKey } from '../lab/useCircuitEditor';
import { ProbabilityBars, StatevectorTable } from '../lab/QuantumStateViews';
import TargetVisual from './TargetVisual';
import { submitCircuit } from './api';
import { beginAttempt, recordGrade, revealHint, useChallengeProgress } from './progress';
import type { Challenge, Grade } from './types';

export function ChallengeBrief({ challenge }: { challenge: Challenge }) {
  const progress = useChallengeProgress();
  const revealed = progress[challenge.id]?.hints ?? 0;
  return <section className="challenge-brief" aria-label="Challenge goal"><div className="challenge-brief-copy">
    <Link href="/challenges" className="challenge-back">← All challenges</Link>
    <div className="q-inline-meta"><Badge tone="blue">{challenge.difficulty}</Badge><span>{challenge.startingCircuit.numQubits} qubit{challenge.startingCircuit.numQubits > 1 ? 's' : ''} · Independent practice</span></div>
    <h1>{challenge.title}</h1><p>{challenge.statement}</p>
    <div className="challenge-start"><strong>Starting point</strong> {challenge.initialState}. {challenge.preparationSteps ? `The ${challenge.preparationSteps} preparation step${challenge.preparationSteps === 1 ? ' is' : 's are'} part of the submitted circuit.` : 'The circuit is empty; build your own solution.'}</div>
    <div className="challenge-help-row"><details><summary>Constraints & scoring</summary><ul>{challenge.constraints.map(c => <li key={c}>{c}</li>)}</ul><p>{challenge.scoring}</p><p>Tolerance: {challenge.tolerance}. Bit labels read q{challenge.startingCircuit.numQubits - 1}…q0; q0 is the rightmost bit.</p></details>
      <details><summary>Hints {revealed > 0 && `(${revealed}/${challenge.hints.length})`}</summary><p>Take one nudge at a time. Hints never reduce your score.</p><ol>{challenge.hints.slice(0, revealed).map(h => <li key={h}>{h}</li>)}</ol>
        {revealed < challenge.hints.length ? <button onClick={() => revealHint(challenge.id, challenge.title)}>Reveal hint {revealed + 1} of {challenge.hints.length}</button> : <p>All hints revealed. Try your idea in the Lab.</p>}</details></div>
  </div><TargetVisual challenge={challenge} /></section>;
}

export function ChallengeGrading({ challenge, request, blocked, nextChallenge, onInspect, onSubmitting }: {
  challenge: Challenge; request: SimulationRequest; blocked: boolean; nextChallenge?: Challenge; onInspect: () => void; onSubmitting: () => void;
}) {
  const progress = useChallengeProgress();
  const [result, setResult] = useState<{ grade: Grade; staleOnArrival: boolean } | null>(() => {
    const last = progress[challenge.id]?.last;
    return last ? { grade: last, staleOnArrival: false } : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const currentKey = circuitKey(request);
  const current = useRef(currentKey);
  // Count revisions, including an edit followed by Undo while a request is in flight.
  useLayoutEffect(() => { if (current.current !== currentKey) { current.current = currentKey; revision.current += 1; } }, [currentKey]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const stale = !!result && (result.staleOnArrival || circuitKey(result.grade.circuit) !== currentKey);
  async function submit() {
    if (blocked) return;
    onSubmitting();
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const snapshot = structuredClone(request);
    const submittedRevision = revision.current;
    const submissionId = crypto.randomUUID();
    setPending(true); setError(null);
    beginAttempt(challenge.id, challenge.title);
    try {
      const grade = await submitCircuit(challenge, snapshot, submissionId, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      const outdated = submittedRevision !== revision.current || current.current !== circuitKey(snapshot);
      setResult({ grade, staleOnArrival: outdated });
      if (!outdated) recordGrade(challenge.id, challenge.title, grade);
    } catch (cause) {
      if (active.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Grading failed. Please retry.');
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); }
    }
  }
  const grade = result?.grade;
  return <section className="challenge-grading" aria-label="Verified grading">
    <div className="challenge-submit-row"><div><h2>Ready to test your idea?</h2><p>Qiskit checks {challenge.criterion === 'state' ? 'every amplitude and relative phase' : 'the exact ideal distribution'}. Shots do not affect your grade.</p></div>
      <button className="lab-primary challenge-submit" disabled={blocked} onClick={() => void submit()}>{pending ? 'Submit newer version' : 'Submit for grading'} <span aria-hidden="true">↗</span></button></div>
    {pending && <p className="challenge-pending" role="status">Verifying your circuit with Qiskit… You can keep editing; submit again to replace this request.</p>}
    {error && <div className="challenge-grade-error" role="alert"><strong>No grade awarded</strong><p>{error}</p><button disabled={blocked} onClick={() => void submit()}>Retry grading</button></div>}
    {grade && <div className="challenge-feedback" data-tone={stale ? 'stale' : grade.valid && grade.targetAchieved ? 'success' : 'revise'} aria-live="polite" aria-atomic="true">
      <div className="challenge-feedback-heading"><div><span className="challenge-kicker">{stale ? 'EARLIER CIRCUIT VERSION' : 'VERIFIED BY QISKIT'}</span><h3>{stale ? 'Previous feedback is stale' : !grade.valid ? 'Check the circuit constraints' : grade.targetAchieved ? 'Target achieved' : 'Keep experimenting'}</h3></div><div className="challenge-score"><strong>{grade.score}</strong><span>/ 100</span></div></div>
      {stale && <p className="challenge-stale-note">This feedback belongs to the submitted snapshot below, not your current circuit. Submit again to verify this version. No new completion is awarded from a late, stale response.</p>}
      <p>{grade.feedback}</p>
      {grade.violatedConstraints.length > 0 && <ul>{grade.violatedConstraints.map(c => <li key={c}>{c}</li>)}</ul>}
      {grade.metrics && <dl className="challenge-metrics">{grade.metrics.fidelity !== null && <div><dt>State fidelity</dt><dd title={String(grade.metrics.fidelity)}>{(grade.metrics.fidelity * 100).toFixed(4)}%</dd></div>}<div><dt>Probability distance</dt><dd title={String(grade.metrics.totalVariationDistance)}>{grade.metrics.totalVariationDistance.toFixed(6)}</dd></div><div><dt>Constraints</dt><dd>{grade.valid ? 'Satisfied' : 'Need attention'}</dd></div></dl>}
      <details className="challenge-evidence"><summary>Inspect graded snapshot & evidence</summary><p>Submission {grade.submissionId.slice(0, 8)} · {grade.circuit.numQubits} qubits · {grade.circuit.gates.length} gates. Probability distance is total variation distance; 0 means matching distributions.</p>
        <ol>{grade.circuit.gates.map((g, i) => <li key={g.id}>Step {i + 1}: {g.type.toUpperCase()} {g.controls.length ? `q${g.controls[0]} → ` : ''}q{g.targets[0]}</li>)}</ol>{!grade.circuit.gates.length && <p>Empty circuit.</p>}
        {grade.probabilities && <ProbabilityBars probabilities={grade.probabilities} prefix="graded" />}
        {grade.statevector && <StatevectorTable statevector={grade.statevector} basis={Object.keys(grade.probabilities!).sort()} label="Graded snapshot amplitudes" />}</details>
      <div className="challenge-feedback-actions">{grade.inspectStep !== null && <button onClick={onInspect}>{stale ? 'Explore current circuit' : `Explore toward step ${grade.inspectStep}`}</button>}
        {!stale && grade.valid && grade.targetAchieved && <>{nextChallenge && <Link href={`/challenges/${nextChallenge.id}`}>Next: {nextChallenge.title} →</Link>}<Link href="/progress">View progress update →</Link><Link href="/challenges">Back to challenges</Link></>}</div>
    </div>}
  </section>;
}
