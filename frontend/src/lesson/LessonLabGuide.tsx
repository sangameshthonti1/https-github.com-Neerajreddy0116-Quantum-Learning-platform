import { useEffect, useState } from 'react';
import type { SimulationRequest, SimulationResponse } from '../api/types';
import type { TraceSnapshot, useStateTrace } from '../lab/useStateTrace';
import { experimentMatches, isLessonCircuit, updateLesson, useLesson, visitSection, type Experiment } from './lessonState';
import { predictions } from './content';
import './lesson.css';

export default function LessonLabGuide({ experiment, request, result, trace, exploring, busy, failed, onReset }: {
  experiment: Experiment; request: SimulationRequest;
  result: { request: SimulationRequest; response: SimulationResponse } | null;
  trace: ReturnType<typeof useStateTrace>; exploring: boolean; busy: boolean; failed: boolean; onReset: () => void;
}) {
  const lesson = useLesson();
  const prediction = lesson.predictions[experiment];
  const [visits, setVisits] = useState<{ snapshot: TraceSnapshot | null; indices: number[] }>({ snapshot: null, indices: [] });
  useEffect(() => {
    if (exploring && trace.step && trace.snapshot) {
      const snapshot = trace.snapshot;
      const index = trace.step.index;
      setVisits((previous) => ({ snapshot, indices: [...new Set([...(previous.snapshot === snapshot ? previous.indices : []), index])] }));
    }
  }, [exploring, trace.step, trace.snapshot]);
  const correct = isLessonCircuit(request, experiment);
  const matched = experimentMatches(experiment, request, result, trace.snapshot);
  const inspected = visits.snapshot === trace.snapshot && Array.from({ length: request.gates.length + 1 }, (_, i) => i).every((i) => visits.indices.includes(i));
  const ready = prediction !== undefined && correct && matched && inspected && !busy && !failed && !trace.error && !trace.cancelled;
  return <section className="lesson-lab-guide" aria-label="Lesson experiment">
    <div className="lesson-guide-heading"><h2>{experiment === 'h' ? 'Your first H circuit' : 'Add a second H'}</h2><a href="/learn/superposition">Return to lesson</a></div>
    {prediction === undefined ? <p>Start with a prediction in the lesson before collecting this experiment.</p> : <>
      <p>Your recorded prediction: <strong>{predictions[experiment].options[prediction]}</strong>.</p>
      <ol>
        <li>{experiment === 'h' ? 'Start with one empty wire, q0. That means qubit number zero, prepared in |0⟩.' : 'Keep the first H on q0. Both H gates must be on this same wire, with no reading between them.'}</li>
        <li>Select <strong>H</strong> in the gate palette, then select the <strong>+</strong> cell on q0 at step {experiment === 'h' ? '1' : '2'}. Tab and Enter work too.</li>
        <li>Check for exactly {experiment === 'h' ? 'one H gate' : 'two H gates'}. Choose <strong>Run Simulation</strong> to repeat preparation, gates, and one final reading for each shot (one run).</li>
        <li>Choose <strong>Explore steps</strong>. Read the initial probabilities, then use <strong>Next step</strong> to inspect {experiment === 'h' ? 'the state after H' : 'both gates in order'}. These are calculated states before any reading.</li>
      </ol>
      <details><summary>Help reading the Explorer</summary><p>The probability bars show chances of reading zero or one. “Statevector” means the list of amplitudes: open Step statevector to read it. Real and Imaginary are two parts of a complex number; the imaginary parts are zero in this experiment.</p><p>The Bloch sphere is a map of one qubit’s state, not a ball moving in space. Its top (+Z) represents |0⟩. The direction marked +X represents equal positive amplitudes. On a small screen, use Qubit sphere to see it.</p></details>
      <p role="status">{failed || trace.error ? 'The experiment could not finish. Retry Run Simulation or Retry trace after the connection is restored.'
        : !correct ? `Circuit check: use one qubit with exactly ${experiment === 'h' ? 'one H gate' : 'two H gates'} on q0. No other gates.`
          : !matched ? 'Circuit check passed. Run Simulation and Explore steps for this exact circuit; results from earlier edits cannot be used.'
            : !inspected ? 'Results received. Visit the initial state and each gate in the State Explorer before collecting your experiment.'
              : busy ? 'Wait for the current request or pending edit to finish.' : 'You inspected every step. This experiment is ready to bring back to the lesson.'}</p>
      <div className="lesson-guide-actions"><button className="lab-primary" disabled={!ready} onClick={() => {
        if (!ready || !result || !trace.snapshot || prediction === undefined) return;
        updateLesson((s) => ({ ...visitSection(s, experiment === 'h' ? 6 : 7), evidence: { ...s.evidence, [experiment]: {
          request: structuredClone(request), simulation: structuredClone(result.response), trace: structuredClone(trace.snapshot!.response), prediction, inspectedSteps: [...visits.indices],
        } } }));
        window.location.assign('/learn/superposition');
      }}>Collect experiment & return</button><button onClick={onReset}>Start over with one empty qubit</button></div>
    </>}
  </section>;
}
