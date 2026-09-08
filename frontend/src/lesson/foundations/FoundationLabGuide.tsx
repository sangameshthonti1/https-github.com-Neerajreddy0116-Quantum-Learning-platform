import { useEffect, useState } from 'react';
import { Link, navigate } from '../../app/navigation';
import type { SimulationRequest, SimulationResponse } from '../../api/types';
import type { TraceSnapshot, useStateTrace } from '../../lab/useStateTrace';
import { foundations, getExperiment } from './content';
import { circuitMatches, matchesEvidence, updateFoundation, useFoundations } from './state';
import type { FoundationId } from './types';
import '../lesson.css';

export default function FoundationLabGuide({ id, experimentId, request, result, trace, exploring, busy, failed, onReset }: {
  id: FoundationId; experimentId: string; request: SimulationRequest;
  result: { request: SimulationRequest; response: SimulationResponse } | null;
  trace: ReturnType<typeof useStateTrace>; exploring: boolean; busy: boolean; failed: boolean; onReset: () => void;
}) {
  const state = useFoundations()[id]; const e = getExperiment(id, experimentId)!;
  const prediction = state.predictions[experimentId];
  const [visits, setVisits] = useState<{ snapshot: TraceSnapshot | null; indices: number[] }>({ snapshot: null, indices: [] });
  useEffect(() => {
    if (exploring && trace.step && trace.snapshot) {
      const snapshot = trace.snapshot; const index = trace.step.index;
      setVisits((previous) => ({ snapshot, indices: [...new Set([...(previous.snapshot === snapshot ? previous.indices : []), index])] }));
    }
  }, [exploring, trace.step, trace.snapshot]);
  const correct = circuitMatches(e, request);
  const matched = matchesEvidence(e, request, result, trace.snapshot);
  const inspected = visits.snapshot === trace.snapshot && e.expected.every((_, i) => visits.indices.includes(i));
  const ready = prediction !== undefined && matched && inspected && !busy && !failed && !trace.error && !trace.cancelled && !trace.stale;
  const stage = foundations[id].sections.findIndex((s) => s.experiment === experimentId);
  function returnToActivity() { updateFoundation(id, (s) => ({ ...s, stage, visited: [...new Set([...s.visited, stage])] })); }
  return <section className="lesson-lab-guide" aria-label="Lesson experiment">
    <div className="lesson-guide-heading"><h2>{e.title}</h2><Link href={`/learn/${id}`} onClick={returnToActivity}>Return to lesson</Link></div>
    <p>{foundations[id].title} · {e.numQubits} {e.numQubits === 1 ? 'qubit' : 'qubits'} · {e.gates.length} gates</p>
    {prediction === undefined ? <p>Submit your prediction in the lesson before collecting this experiment. You can still build and explore now.</p> : <p>Your recorded prediction: <strong>{e.prediction.options[prediction]}</strong>.</p>}
    <details className="lesson-construction-help"><summary>Building your experiment · step-by-step guide</summary><ol>{e.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol></details>
    <details><summary>Help reading the Explorer</summary><p>A trace is a sequence of calculated states: before any gates, then after each gate. None of these snapshots include measurement. Probability bars show chances; Step statevector shows the amplitudes behind them.</p><p>The Bloch sphere maps one qubit. On a small screen, use Qubit sphere. +Z means |0⟩ and −Z means |1⟩. {id === 'entanglement' ? 'Use Inspect q0 and Inspect q1 to compare both reduced states. The final centered vectors mean maximally mixed individual states, even though the joint Bell state is pure.' : '+X and −X represent equal magnitudes with matching and opposite signs.'}</p></details>
    <p role="status">{failed || trace.error ? 'The experiment could not finish. Retry Run Simulation or Retry trace when the backend is available.'
      : !correct ? `Circuit check: use ${e.numQubits} ${e.numQubits === 1 ? 'qubit' : 'qubits'} with ${e.gates.length ? e.gates.map((gate) => `${gate.type.toUpperCase()} ${gate.control !== undefined ? `q${gate.control} → ` : ''}q${gate.target}`).join(', then ') : 'no gates'}. Check order, targets, and controls; no extra gates.`
        : !matched ? 'Circuit check passed. Run Simulation and Explore steps for this exact circuit and settings. Results from earlier edits cannot be used.'
          : !inspected ? 'Results received. Inspect the initial state and every gate step before collecting.'
            : busy ? 'Wait for the current request or pending edit to finish.' : prediction === undefined ? 'Your experiment is inspected. Return to the lesson to submit a prediction before collecting.' : 'Every step is inspected. Your experiment is ready to collect.'}</p>
    <div className="lesson-guide-actions"><button className="lab-primary" disabled={!ready} onClick={() => {
      if (!ready || !result || !trace.snapshot || prediction === undefined) return;
      const evidence = { lessonId: id, experimentId, request: structuredClone(request), simulation: structuredClone(result.response), trace: structuredClone(trace.snapshot.response), prediction, inspectedSteps: [...visits.indices] };
      updateFoundation(id, (s) => ({ ...s, stage, visited: [...new Set([...s.visited, stage])], evidence: { ...s.evidence, [experimentId]: evidence } }));
      navigate(`/learn/${id}`);
    }}>Collect experiment &amp; return</button><button onClick={onReset}>Start over with {e.numQubits === 1 ? 'one empty qubit' : 'two empty qubits'}</button></div>
  </section>;
}
