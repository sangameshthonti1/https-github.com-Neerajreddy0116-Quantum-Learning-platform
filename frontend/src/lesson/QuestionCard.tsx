import { useState } from 'react';
import type { Question } from './content';

export default function QuestionCard({ question, submitted, onSubmit, prediction = false }: {
  question: Question; submitted?: number; onSubmit: (choice: number) => void; prediction?: boolean;
}) {
  const [choice, setChoice] = useState<number | undefined>(submitted);
  const [retrying, setRetrying] = useState(false);
  const revealed = submitted !== undefined && !retrying;
  return <form className="lesson-question" onSubmit={(event) => {
    event.preventDefault(); if (choice !== undefined) { onSubmit(choice); setRetrying(false); }
  }}>
    <fieldset disabled={revealed}>
      <legend>{question.prompt}</legend>
      {question.options.map((option, index) => <label className="lesson-option" key={option}>
        <input type="radio" name={question.id} checked={choice === index} onChange={() => setChoice(index)} />
        <span>{option}</span>
      </label>)}
    </fieldset>
    {!revealed && <button className="lesson-primary" disabled={choice === undefined}>{prediction ? 'Submit prediction' : 'Check my answer'}</button>}
    {revealed && <div className="lesson-feedback" role="status">
      <p>{prediction ? 'Your prediction: ' : 'Your answer: '}{question.options[submitted]}</p>
      <p>{question.feedback[submitted]}</p>
      {!prediction && submitted !== question.correct && <button type="button" onClick={() => { setRetrying(true); setChoice(undefined); }}>Try this question again</button>}
    </div>}
  </form>;
}
