import { Link } from '../app/navigation';
import { quiz, scoreQuiz } from './content';
import { hasPassedQuiz, isLessonComplete, updateLesson, useLesson } from './lessonState';

export default function LessonQuiz() {
  const lesson = useLesson();
  const score = scoreQuiz(lesson.answers);
  const complete = isLessonComplete(lesson);
  return <>
    <p>Use what you observed. Answer all five questions, then check them together. You can review every explanation and retry as often as you like. Complete both experiments and answer all five correctly to finish.</p>
    {hasPassedQuiz(lesson) && !complete && <p className="lesson-browse-note">Your quiz pass is recorded. Lesson completion still requires both verified Lab experiments; visiting their sections does not earn that credit.</p>}
    <form aria-label="Understanding check" onSubmit={(event) => {
      event.preventDefault();
      if (!lesson.graded && quiz.every((q) => lesson.answers[q.id] !== undefined))
        updateLesson((s) => ({ ...s, graded: true, quizAttempts: [...s.quizAttempts, { answers: { ...s.answers } }] }));
    }}>
      {quiz.map((q, n) => <fieldset className="lesson-question" key={q.id} disabled={lesson.graded}>
        <legend>{n + 1}. {q.prompt}</legend>
        {q.options.map((option, index) => <label className="lesson-option" key={option}><input type="radio" name={q.id} checked={lesson.answers[q.id] === index} onChange={() => updateLesson((s) => ({ ...s, answers: { ...s.answers, [q.id]: index } }))} /><span>{option}</span></label>)}
        {lesson.graded && <p className="lesson-feedback">{lesson.answers[q.id] === q.correct ? 'Correct. ' : 'Review this idea. '}{q.feedback[lesson.answers[q.id] ?? 0]} {lesson.answers[q.id] !== q.correct && `The answer is: ${q.options[q.correct]}`}</p>}
      </fieldset>)}
      {!lesson.graded && <button className="lesson-primary" disabled={!quiz.every((q) => lesson.answers[q.id] !== undefined)}>Grade my answers</button>}
    </form>
    {lesson.graded && <div className="lesson-callout" role="status"><h3>{score} of {quiz.length} correct</h3><p>{score === quiz.length ? 'You connected the state, the gates, and the readings.' : 'Read the feedback above, revisit any earlier section, and try again. Your experiment records stay with you.'}</p>
      <button onClick={() => updateLesson((s) => ({ ...s, graded: false, answers: {} }))}>Retry understanding check</button></div>}
    {lesson.quizAttempts.length > 0 && <details><summary>Submitted quiz attempts ({lesson.quizAttempts.length})</summary><p>Retries keep your earlier attempts and any earned pass for this tab’s session.</p>
      {lesson.quizAttempts.map((attempt, index) => <section key={index} aria-label={`Quiz attempt ${index + 1}`}><h3>Attempt {index + 1}: {scoreQuiz(attempt.answers)} of {quiz.length} correct</h3><ul>{quiz.map((q) => <li key={q.id}>{q.prompt} Your answer: {q.options[attempt.answers[q.id]!]}. {q.feedback[attempt.answers[q.id]!]}</li>)}</ul></section>)}
    </details>}
    {complete && <section className="lesson-complete" aria-label="Lesson complete"><span aria-hidden="true">✓</span><h2>Lesson complete</h2><p>You built and tested H and H followed by H. You can now connect amplitudes to probabilities, read a statevector, and explain how interference differs from a hidden classical bit.</p><p>You also know why equal chances do not guarantee equal sampled counts.</p><p><strong>Progress is only in this browser tab’s session, not saved to an account.</strong> Closing the tab ends this saved progress. Account progress and cross-device access are future work.</p><Link href="/lab">Continue exploring in the Circuit Lab →</Link></section>}
  </>;
}
