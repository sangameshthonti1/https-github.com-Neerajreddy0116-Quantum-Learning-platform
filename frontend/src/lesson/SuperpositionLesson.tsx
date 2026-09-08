import { useEffect, useRef } from 'react';
import { Link } from '../app/navigation';
import { Amplitudes, Bits, CircuitSketch, Hadamard, Interference, Welcome } from './ConceptStages';
import QuestionCard from './QuestionCard';
import ExperimentResults from './ExperimentResults';
import LessonQuiz from './LessonQuiz';
import { amplitudeCheck, bitCheck, observationCheck, predictions, stages } from './content';
import { sectionStatus, updateLesson, useLesson, visitSection } from './lessonState';
import '../lab/lab.css';
import '../lab/explorer.css';
import './lesson.css';

export default function SuperpositionLesson() {
  const lesson = useLesson();
  const { stage } = lesson;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    updateLesson((s) => s.visited.includes(s.stage) ? s : visitSection(s, s.stage));
  }, []);
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [stage]);
  const statuses = stages.map((_, index) => sectionStatus(lesson, index));
  const completedCount = statuses.filter((status) => status === 'Completed').length;
  function move(next: number) { updateLesson((s) => visitSection(s, next)); }
  return <main className="lab lesson">
    <a className="lesson-skip" href="#lesson-content">Skip to lesson</a>
    <header className="lesson-header"><Link href="/learn">← All lessons</Link><span>FOUNDATIONS <small>Lesson 01</small></span><Link href="/lab">Circuit Lab ↗</Link></header>
    <div className="lesson-title"><p>GUIDED LESSON · NO PRIOR KNOWLEDGE NEEDED</p><h1>Superposition and<br className="lesson-title-break" /> the Hadamard Gate</h1><p>One qubit. A new way to think. Two experiments you build yourself.</p></div>
    <div className="lesson-layout">
      <aside className="lesson-progress"><p>YOUR LEARNING PATH</p><p>Section {stage + 1} of {stages.length} · {completedCount} completed</p><progress aria-label="Lesson sections completed" max={stages.length} value={completedCount} />
        <nav aria-label="Lesson sections">{stages.map((name, index) => <button key={name} aria-current={stage === index ? 'step' : undefined} onClick={() => move(index)}><span aria-hidden="true">{statuses[index] === 'Completed' ? '✓' : String(index + 1).padStart(2, '0')}</span><span className="lesson-section-label">{name}<small>{statuses[index]}</small></span></button>)}</nav>
        <p className="lesson-session">Progress stays in this tab’s session. It is not saved to an account. If browser storage is blocked, refreshing clears progress.</p>
      </aside>
      <article id="lesson-content" className="lesson-content">
        <p className="lesson-section-number">{String(stage + 1).padStart(2, '0')} / {String(stages.length).padStart(2, '0')}</p>
        <h2 ref={heading} tabIndex={-1}>{stages[stage]}</h2>
        <p className="lesson-browse-note">{statuses[stage]} · You can open any section. Unfinished activities can be completed later.</p>
        {stage === 0 && <Welcome />}
        {stage === 1 && <><Bits /><QuestionCard question={bitCheck} submitted={lesson.checks.bit} onSubmit={(choice) => updateLesson((s) => ({ ...s, checks: { ...s.checks, bit: choice } }))} /></>}
        {stage === 2 && <><Amplitudes /><QuestionCard question={amplitudeCheck} submitted={lesson.checks.amplitude} onSubmit={(choice) => updateLesson((s) => ({ ...s, checks: { ...s.checks, amplitude: choice } }))} /></>}
        {stage === 3 && <Hadamard />}
        {stage === 4 && <><p>Pause before building. Use the amplitude rule to make a prediction about the <strong>ideal probabilities</strong>: the chances calculated from the state in a model without hardware noise. Your prediction is not graded; it gives you something to compare with your experiment.</p><QuestionCard question={predictions.h} prediction submitted={lesson.predictions.h} onSubmit={(choice) => updateLesson((s) => ({ ...s, predictions: { ...s.predictions, h: choice } }))} /></>}
        {stage === 5 && <><p>Now put the idea into practice. The Lab will open with one empty qubit on your first visit. You will place the gate yourself.</p><ol className="lesson-build-steps"><li>Find the wire labelled <strong>q0</strong>. This means qubit number zero, starting in |0⟩.</li><li>Select <strong>H</strong> in the palette of available gates.</li><li>Click or tap the <strong>+</strong> on q0 at step 1. Or use Tab and Enter.</li><li>Check there is exactly one H and no other gates.</li><li>Choose <strong>Run Simulation</strong>. A shot is one fresh run of your circuit followed by a reading. The default is 1,024 shots.</li><li>Choose <strong>Explore steps</strong>. A trace shows the calculated state after each operation. Inspect the initial state, then choose <strong>Next step</strong> to inspect the state after H.</li><li>Choose <strong>Collect experiment &amp; return</strong> to bring your results here.</li></ol><p>The State Explorer’s “statevector” is a list of amplitudes. Its Bloch sphere is a map of one qubit’s state. We’ll read both together when you return.</p><Link className="lesson-link-button" href="/lab?lesson=superposition&experiment=h">Open the Lab: build one H →</Link><p>If you get stuck, use “Start over with one empty qubit” in the Lab. The existing H template is also available as a recovery aid. Your prediction stays recorded.</p>{lesson.evidence.h && <p role="status">Your one-H experiment is collected. Continue to read the results.</p>}</>}
        {stage === 6 && (lesson.evidence.h ? <><ExperimentResults evidence={lesson.evidence.h} experiment="h" /><QuestionCard question={observationCheck} submitted={lesson.checks.observation} onSubmit={(choice) => updateLesson((s) => ({ ...s, checks: { ...s.checks, observation: choice } }))} /></> : <p>Your results will appear here after you collect the one-H experiment. You can keep browsing now, or <button onClick={() => move(4)}>make your prediction</button> and <Link href="/lab?lesson=superposition&experiment=h">open the guided Lab</Link>.</p>)}
        {stage === 7 && <><p>One H gives equal ideal chances starting from |0⟩. What happens with another H on the same qubit, <strong>before any measurement</strong>?</p><CircuitSketch twice /><QuestionCard question={predictions.hh} prediction submitted={lesson.predictions.hh} onSubmit={(choice) => updateLesson((s) => ({ ...s, predictions: { ...s.predictions, hh: choice } }))} />
          {lesson.predictions.hh !== undefined && <><p>{lesson.evidence.h ? 'On your first visit, the Lab starts from your collected one-H circuit. Select H again and place it in the next + cell on q0, at step 2.' : 'Without a collected one-H circuit, your first Lab visit starts empty. Place H on q0 at step 1, then add another H on q0 at step 2.'} Returning visits restore your draft. Run and explore all three snapshots, then collect your experiment.</p><Link className="lesson-link-button" href="/lab?lesson=superposition&experiment=hh">Open the Lab: add a second H →</Link></>}
          {lesson.evidence.hh && <><ExperimentResults evidence={lesson.evidence.hh} experiment="hh" /><Interference /></>}</>}
        {stage === 8 && <LessonQuiz />}
        {(stage === 0 || stage === 3) && <button disabled={lesson.readings.includes(stage)} onClick={() => updateLesson((s) => ({ ...s, readings: [...new Set([...s.readings, stage])] }))}>{lesson.readings.includes(stage) ? 'Marked as read' : 'Mark as read'}</button>}
        <footer className="lesson-navigation"><button disabled={stage === 0} onClick={() => move(stage - 1)}>← Back</button><span>Navigation does not mark an activity complete.</span>{stage < 8 && <button className="lesson-primary" onClick={() => move(stage + 1)}>Next →</button>}</footer>
      </article>
    </div>
    <footer className="lesson-footer">Learn by predicting, building, and observing · Real local Qiskit simulation</footer>
  </main>;
}
