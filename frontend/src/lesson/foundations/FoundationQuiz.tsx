import { Link } from '../../app/navigation';
import { foundations } from './content';
import { foundationComplete, passedFoundationQuiz, scoreFoundationQuiz, updateFoundation, type FoundationState } from './state';
import type { FoundationId } from './types';

export default function FoundationQuiz({ id, state }: { id: FoundationId; state: FoundationState }) {
  const lesson = foundations[id]; const quiz = lesson.quiz;
  const complete = foundationComplete(id, state);
  return <><p>Answer all {quiz.length} questions, then grade them together. Feedback explains every answer. Retries keep your earlier attempts and any earned pass.</p>
    {passedFoundationQuiz(id, state) && !complete && <p className="lesson-callout">Your quiz pass is recorded. Finish the concept checks and verified experiments in the other sections to complete this lesson.</p>}
    <form aria-label="Understanding check" onSubmit={(event) => { event.preventDefault();
      if (!state.graded && quiz.every((q) => state.answers[q.id] !== undefined)) updateFoundation(id, (s) => ({ ...s, graded: true, quizAttempts: [...s.quizAttempts, { ...s.answers }] }));
    }}>{quiz.map((q, i) => <fieldset className="lesson-question" key={q.id} disabled={state.graded}><legend>{i + 1}. {q.prompt}</legend>{q.options.map((option, index) => <label className="lesson-option" key={option}><input type="radio" name={q.id} checked={state.answers[q.id] === index} onChange={() => updateFoundation(id, (s) => ({ ...s, answers: { ...s.answers, [q.id]: index } }))} /><span>{option}</span></label>)}
      {state.graded && <p className="lesson-feedback">{q.feedback[state.answers[q.id]!]} {state.answers[q.id] !== q.correct && `The answer is: ${q.options[q.correct]}`}</p>}
    </fieldset>)}{!state.graded && <button className="lesson-primary" disabled={!quiz.every((q) => state.answers[q.id] !== undefined)}>Grade my answers</button>}</form>
    {state.graded && <div className="lesson-callout" role="status"><h3>{scoreFoundationQuiz(id, state.answers)} of {quiz.length} correct</h3><p>{passedFoundationQuiz(id, state) ? 'Your passed attempt is saved in this session.' : 'Use the explanations above, revisit the experiments, and try again.'}</p><button onClick={() => updateFoundation(id, (s) => ({ ...s, graded: false, answers: {} }))}>Retry understanding check</button></div>}
    {state.quizAttempts.length > 0 && <details><summary>Submitted quiz attempts ({state.quizAttempts.length})</summary>{state.quizAttempts.map((attempt, i) => <section key={i} aria-label={`Quiz attempt ${i + 1}`}><h3>Attempt {i + 1}: {scoreFoundationQuiz(id, attempt)} of {quiz.length} correct</h3><ul>{quiz.map((q) => <li key={q.id}>{q.prompt} Your answer: {q.options[attempt[q.id]!]}. {q.feedback[attempt[q.id]!]}</li>)}</ul></section>)}</details>}
    {complete && <section className="lesson-complete" aria-label="Lesson complete"><h2>Lesson complete</h2><p>You predicted, built, inspected, and explained your experiments. You can now:</p><ul>{lesson.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul><p>Progress is session-only, stored in this browser tab.</p><Link className="lesson-link-button" href={lesson.next.href}>{lesson.next.title} →</Link></section>}
  </>;
}
