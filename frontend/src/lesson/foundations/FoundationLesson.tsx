import { useEffect, useRef } from 'react';
import { Link } from '../../app/navigation';
import QuestionCard from '../QuestionCard';
import ConceptVisual from './ConceptVisual';
import CollectedResults from './CollectedResults';
import FoundationQuiz from './FoundationQuiz';
import { experimentHref, foundations, getExperiment } from './content';
import { foundationSectionStatus, hasFoundationEvidence, updateFoundation, useFoundations, visitFoundation } from './state';
import type { FoundationId } from './types';
import '../../lab/lab.css';
import '../../lab/explorer.css';
import '../lesson.css';
import './foundations.css';

export default function FoundationLesson({ id }: { id: FoundationId }) {
  const state = useFoundations()[id]; const lesson = foundations[id]; const section = lesson.sections[state.stage]!;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { visitFoundation(id, state.stage); heading.current?.focus(); window.scrollTo(0, 0); }, [id, state.stage]);
  const statuses = lesson.sections.map((_, i) => foundationSectionStatus(id, state, i));
  const experiment = section.experiment ? getExperiment(id, section.experiment) : undefined;
  const review = getExperiment(id, section.experiment ?? section.review ?? '');
  const evidence = review && hasFoundationEvidence(id, state, review.id) ? state.evidence[review.id] : undefined;
  const canCheck = !(section.experiment || section.review) || !!evidence;
  return <main className="lab lesson foundation-lesson">
    <a className="lesson-skip" href="#lesson-content">Skip to lesson</a>
    <header className="lesson-header"><Link href="/learn">← All lessons</Link><span>FOUNDATIONS <small>Lesson {lesson.number}</small></span><Link href="/lab">Circuit Lab ↗</Link></header>
    <div className="lesson-title"><p>GUIDED LESSON · LEARN BY EXPERIMENTING</p><h1>{lesson.title}</h1><p>{lesson.description}</p><details className="foundation-outcomes"><summary>What you’ll be able to do</summary><ul>{lesson.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul><p>New to quantum? Begin with Qubits and measurement, then Superposition. All sections remain open so you can revisit an idea whenever you need it.</p></details></div>
    <div className="lesson-layout"><aside className="lesson-progress"><p>YOUR LEARNING PATH</p><p>Section {state.stage + 1} of {lesson.sections.length} · {statuses.filter((s) => s === 'Completed').length} completed</p><progress aria-label="Lesson sections completed" max={lesson.sections.length} value={statuses.filter((s) => s === 'Completed').length} />
      <nav aria-label="Lesson sections">{lesson.sections.map((item, i) => <button key={item.title} aria-current={state.stage === i ? 'step' : undefined} onClick={() => visitFoundation(id, i)}><span aria-hidden="true">{statuses[i] === 'Completed' ? '✓' : String(i + 1).padStart(2, '0')}</span><span className="lesson-section-label">{item.title}<small>{statuses[i]}</small></span></button>)}</nav><p className="lesson-session">Progress stays in this tab’s session, separately for each lesson. Opening a section records a visit; its checked activity earns completion.</p>
    </aside><article id="lesson-content" className="lesson-content"><p className="lesson-section-number">{String(state.stage + 1).padStart(2, '0')} / {String(lesson.sections.length).padStart(2, '0')}</p><h2 ref={heading} tabIndex={-1}>{section.title}</h2><p className="lesson-browse-note">{statuses[state.stage]} · Open any section and return to unfinished activities later.</p>
      <div key={`${id}:${state.stage}`}>
        {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.visual && <ConceptVisual kind={section.visual} />}
        {section.equation && <><div className="lesson-equation">{section.equation.notation}</div><p>{section.equation.explanation}</p></>}
        {section.detail && <details><summary>{section.detail.title}</summary><p>{section.detail.text}</p></details>}
        {experiment && <><QuestionCard question={experiment.prediction} prediction submitted={state.predictions[experiment.id]} onSubmit={(choice) => updateFoundation(id, (s) => ({ ...s, predictions: { ...s.predictions, [experiment.id]: choice } }))} /><h3>Build and investigate</h3><ol className="lesson-build-steps">{experiment.instructions.map((text) => <li key={text}>{text}</li>)}</ol><Link className="lesson-link-button" href={experimentHref(id, experiment.id)}>Open Lab: {experiment.title} →</Link><p className="lesson-source">First visits start with empty wires; returning visits restore this experiment’s draft. Your free Lab draft is separate. Submit a prediction before collecting evidence.</p></>}
        {review && evidence && <CollectedResults key={review.id} experiment={review} evidence={evidence} />}
        {review && !evidence && <p className="lesson-callout">Your collected results and observation check will appear here after you run and inspect this experiment. You can keep browsing or <Link href={experimentHref(id, review.id)}>open the {review.title} experiment</Link>.</p>}
        {section.check && canCheck && <QuestionCard key={section.check.id} question={section.check} submitted={state.checks[section.check.id]} onSubmit={(choice) => { const check = section.check!; updateFoundation(id, (s) => ({ ...s, checks: { ...s.checks, [check.id]: choice }, checkAttempts: { ...s.checkAttempts, [check.id]: [...(s.checkAttempts[check.id] ?? []), choice] } })); }} />}
        {state.stage === lesson.sections.length - 1 && <FoundationQuiz id={id} state={state} />}
        {id === 'phase' && state.stage === lesson.sections.length - 1 && <section className="foundation-demo-handoff" aria-label="Continue to Deutsch–Jozsa"><span>{statuses.every((status) => status === 'Completed') ? 'LESSON COMPLETE · NEXT APPLICATION' : 'NEXT APPLICATION · PREVIEW ANY TIME'}</span><h3>Use interference to reveal a hidden rule</h3><p>Deutsch–Jozsa turns the phase and interference you just studied into a complete algorithm. Predict whether a constant or balanced oracle will leave an all-zero input, then watch every verified gate execute.</p><Link className="lesson-link-button" href="/algorithms/deutsch-jozsa">Continue to Deutsch–Jozsa →</Link></section>}
      </div>
      <nav className="lesson-navigation" aria-label="Move between sections"><button disabled={state.stage === 0} onClick={() => visitFoundation(id, state.stage - 1)}>← Back</button><span>Navigation never completes an activity.</span><button disabled={state.stage === lesson.sections.length - 1} onClick={() => visitFoundation(id, state.stage + 1)}>Next →</button></nav>
    </article></div><footer className="lesson-footer">Prepare · predict · build · observe · explain. Session-only progress.</footer>
  </main>;
}
