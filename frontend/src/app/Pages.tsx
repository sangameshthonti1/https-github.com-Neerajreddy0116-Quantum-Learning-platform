import { useState } from 'react';
import { hasExperimentEvidence, useLesson } from '../lesson/lessonState';
import { stages } from '../lesson/content';
import { sectionStatus } from '../lesson/lessonState';
import { availableLessonCount, curriculum, learningSummary } from './curriculum';
import { Link } from './navigation';
import { ActionLink, Badge, EmptyState, Icon, PageHeading } from './ui';
import QuantumVisual from './QuantumVisual';

function ProgressOverview() {
  const lesson = useLesson();
  const summary = learningSummary(lesson);
  const experiments = Number(hasExperimentEvidence(lesson, 'h')) + Number(hasExperimentEvidence(lesson, 'hh'));
  return <section className="q-progress-overview" aria-label="Your session progress"><div className="q-section-heading"><h2>Your progress</h2><Badge>Tab session</Badge></div>
    <div className="q-progress-numbers"><div><strong>{summary.complete ? 1 : 0}<small> / 1</small></strong><span>lessons completed</span></div><div><strong>{experiments}<small> / 2</small></strong><span>experiments collected</span></div></div>
    <div className="q-progress-caption"><span>Superposition sections</span><strong>{summary.completed} of {stages.length}</strong></div>
    <progress aria-label="Superposition section progress" max={stages.length} value={summary.completed} />
    <p>{summary.started ? 'Visits and completed activities are tracked separately.' : 'A fresh start. Your first completed activity will appear here.'}</p>
    <Link href="/progress" className="q-text-link">View session progress <Icon name="arrow" size={16} /></Link>
  </section>;
}
export function Dashboard() {
  const lesson = useLesson();
  const summary = learningSummary(lesson);
  return <main className="q-page q-dashboard">
    <div className="q-dashboard-intro"><p className="q-eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p><span>YOUR QUANTUM WORKSPACE</span></div>
    <section className="q-hero" aria-label="Welcome to Quantum Learning"><div className="q-hero-copy"><Badge tone="blue">FROM FIRST PRINCIPLES TO FIRST CIRCUITS</Badge><h1>Quantum makes sense<br />when you <em>build it.</em></h1><p>Turn “what if?” into your first experiment. Learn the ideas, build a circuit, and see the quantum state unfold.</p>
      <ActionLink href="/learn/superposition">{summary.started ? summary.action : 'Start your quantum journey'}</ActionLink><span className="q-hero-note">No quantum background needed. Just curiosity.</span>
    </div><QuantumVisual /></section>
    <div className="q-dashboard-middle"><section className="q-continue"><div className="q-section-heading"><h2>{summary.started ? 'Pick up where you left off' : 'Your first discovery'}</h2><span className="q-overline">GUIDED LEARNING</span></div>
      <div className="q-continue-body"><div className="q-h-gate" aria-hidden="true">H<span>HADAMARD</span></div><div><div className="q-inline-meta"><Badge tone={summary.complete ? 'success' : 'blue'}>{summary.status}</Badge><span>Beginner · 9 sections</span></div><h3>Superposition &amp;<br />the Hadamard gate</h3><p>{summary.started ? `Section ${lesson.stage + 1}: ${summary.stage}` : 'One qubit. Two experiments. A new way to think.'}</p><ActionLink href="/learn/superposition" secondary>{summary.action}</ActionLink></div></div>
    </section><ProgressOverview /></div>
    <section className="q-tools-section"><div className="q-section-heading"><div><p className="q-eyebrow">IDEAS BECOME CLEARER IN PRACTICE</p><h2>Make room for a little experimentation.</h2></div></div>
      <div className="q-tools-grid"><Link href="/lab" className="q-tool-card"><div className="q-mini-circuit" aria-hidden="true"><span>q₀</span><i /><b>H</b><i /><b>+</b><i /></div><div><span className="q-overline">BUILD &amp; TEST</span><h3>Circuit Lab <Icon name="arrow" /></h3><p>Place gates, change your circuit, and run a real quantum simulation.</p><span className="q-tool-foot">H · X · Z · CX <span>Open workspace ↗</span></span></div></Link>
        <Link href="/lab/states" className="q-tool-card q-tool-explorer"><div className="q-mini-sphere" aria-hidden="true"><Icon name="sphere" size={80} /><span>|ψ⟩</span></div><div><span className="q-overline">LOOK INSIDE</span><h3>State Explorer <Icon name="arrow" /></h3><p>Follow your circuit gate by gate. See amplitudes, probabilities, and the Bloch sphere.</p><span className="q-tool-foot">Part of your Circuit Lab <span>Explore states ↗</span></span></div></Link></div>
    </section>
    <section className="q-path-strip"><span className="q-path-number">01—03</span><div><p className="q-eyebrow">THE FOUNDATIONS PATH</p><h2>Start small. Think quantum.</h2><p>Superposition is ready to explore. Entanglement and phase are next on the roadmap.</p></div><ActionLink href="/learn" secondary>Explore curriculum</ActionLink></section>
    <footer className="q-page-footer"><span>Learn by predicting, building, and observing.</span><span>Powered by local Qiskit simulation</span></footer>
  </main>;
}
export function Curriculum() {
  const summary = learningSummary(useLesson());
  const [filter, setFilter] = useState<'all' | 'available'>('all');
  return <main className="q-page"><PageHeading eyebrow="THE LEARNING PATH" title="Big ideas. Small, deliberate steps.">Build intuition before complexity. Each guided lesson connects an idea to an experiment you make yourself.</PageHeading>
    <section className="q-curriculum-banner"><span className="q-foundation-mark" aria-hidden="true">|0⟩<span>→</span>|ψ⟩</span><div><Badge tone="blue">FOUNDATIONS</Badge><h2>Your first steps in quantum</h2><p>No prerequisites. Start with an available lesson and explore at your own pace.</p></div><div className="q-banner-fact"><strong>{String(availableLessonCount).padStart(2, '0')}</strong><span>{availableLessonCount === 1 ? 'lesson' : 'lessons'} available</span></div></section>
    <div className="q-catalog-toolbar"><div className="q-segmented" role="group" aria-label="Filter lessons"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All topics <span>{curriculum.length}</span></button><button aria-pressed={filter === 'available'} onClick={() => setFilter('available')}>Available now <span>{availableLessonCount}</span></button></div><span className="q-muted">Learn at your own pace</span></div>
    <div className="q-catalog">{curriculum.filter((lesson) => filter === 'all' || lesson.href).map((lesson) => <article className="q-lesson-card" key={lesson.id} data-available={!!lesson.href}>
      <div className="q-lesson-index"><span>{lesson.number}</span><div aria-hidden="true">{lesson.id === 'superposition' ? 'H' : lesson.id === 'entanglement' ? '⊗' : 'φ'}</div></div>
      <div className="q-lesson-description"><div className="q-inline-meta"><Badge tone={lesson.href ? 'blue' : 'neutral'}>{lesson.href ? summary.status === 'Not started' ? 'Available now' : summary.status : 'Upcoming'}</Badge><span>{lesson.difficulty} · {lesson.format}</span></div><h2>{lesson.title}</h2><p>{lesson.description}</p><div className="q-outcomes"><span>YOU’LL LEARN TO</span><ul>{lesson.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul></div></div>
      <div className="q-lesson-action">{lesson.href ? <><ActionLink href={lesson.href}>{summary.action}</ActionLink><small>{summary.completed} of 9 sections completed</small></> : <><Badge>In the roadmap</Badge><small>Lesson content is not available yet.</small></>}</div>
    </article>)}</div>
    <aside className="q-catalog-note"><Icon name="lab" /><p>Want to explore freely? The Lab already supports H, X, Z, and CX gates, including a Bell-state template.</p><Link className="q-text-link" href="/lab">Open Circuit Lab <Icon name="arrow" size={16} /></Link></aside>
  </main>;
}
export function Progress() {
  const lesson = useLesson();
  const summary = learningSummary(lesson);
  return <main className="q-page"><PageHeading eyebrow="YOUR LEARNING RECORD" title="Every observation counts.">Your activity in this tab’s session. Progress is not saved to an account or synchronized across devices.</PageHeading>
    <div className="q-progress-page-grid"><ProgressOverview /><section className="q-record-card"><div className="q-section-heading"><h2>Superposition &amp; the Hadamard gate</h2><Badge tone={summary.complete ? 'success' : 'neutral'}>{summary.status}</Badge></div>
      {!summary.started && <p className="q-muted">No lesson activity yet. Opening a section records a visit; completing its activity earns credit.</p>}
      <ol className="q-section-records">{stages.map((stage, index) => <li key={stage}><span>{String(index + 1).padStart(2, '0')}</span><span>{stage}</span><Badge tone={sectionStatus(lesson, index) === 'Completed' ? 'success' : 'neutral'}>{sectionStatus(lesson, index)}</Badge></li>)}</ol><ActionLink href="/learn/superposition">{summary.action}</ActionLink>
    </section></div>
    <section className="q-session-explanation"><h2>What counts as progress?</h2><p>Reading acknowledgements, submitted predictions, checked answers, and verified experiments complete their associated sections. The lesson is complete after both experiments and a perfect graded quiz attempt. Browsing alone never completes an activity.</p><p>Closing this tab normally ends the session. Browser session restoration may retain it. If storage is unavailable, progress lasts only while this app stays open.</p></section>
  </main>;
}
export function Upcoming({ kind }: { kind: 'algorithms' | 'challenges' }) {
  const algorithms = kind === 'algorithms';
  return <main className="q-page"><PageHeading eyebrow="ON THE ROADMAP" title={algorithms ? 'Algorithms, built on understanding.' : 'Put your intuition to the test.'}>{algorithms ? 'A future home for guided quantum algorithm walkthroughs.' : 'A future home for independent circuit challenges.'}</PageHeading>
    <div className="q-upcoming-panel"><Badge>Upcoming</Badge><EmptyState icon={kind} title={algorithms ? 'The next chapter is taking shape.' : 'Your next challenge starts with the basics.'} action={<ActionLink href="/learn">Explore available learning</ActionLink>}>{algorithms ? 'Algorithm lessons are not available in this prebuild. Get comfortable with states, gates, and interference in the foundations lesson.' : 'There are no scored challenges yet. You can already build independently in the Lab and check your understanding in the superposition lesson.'}</EmptyState><Link href="/lab" className="q-text-link">Experiment in Circuit Lab <Icon name="arrow" size={16} /></Link></div>
  </main>;
}
export function NotFound() {
  return <main className="q-page"><EmptyState icon="sphere" title="This page is outside our orbit." action={<ActionLink href="/">Back to dashboard</ActionLink>}>That route doesn’t exist. Your session progress and circuit drafts are still here.</EmptyState></main>;
}
