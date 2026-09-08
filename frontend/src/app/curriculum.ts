import { stages } from '../lesson/content';
import { isLessonComplete, sectionStatus, type LessonState } from '../lesson/lessonState';

interface LessonMetadata {
  id: string;
  number: string;
  title: string;
  description: string;
  difficulty: string;
  outcomes: string[];
  href?: string;
  format: string;
}
export const curriculum: LessonMetadata[] = [
  { id: 'superposition', number: '01', title: 'Superposition & the Hadamard gate',
    description: 'Start with one qubit. Predict what happens, build your first circuit, and discover why two H gates change everything.',
    difficulty: 'Beginner', outcomes: ['Read amplitudes and probabilities', 'Build and test H and H → H', 'Explain interference from your observations'],
    href: '/learn/superposition', format: '9 sections · 2 experiments' },
  { id: 'entanglement', number: '02', title: 'Entanglement & shared states',
    description: 'Investigate how two qubits can share a state, and what their individual views leave out.', difficulty: 'Beginner',
    outcomes: ['Connect joint and individual qubit states', 'Interpret correlations in a Bell state'], format: 'Planned guided lesson' },
  { id: 'phase', number: '03', title: 'Phase & quantum interference',
    description: 'Look beyond probability bars to understand the signs and phases of amplitudes.', difficulty: 'Beginner',
    outcomes: ['Distinguish amplitude from probability', 'Reason about phase and later gates'], format: 'Planned guided lesson' },
];
export const availableLessonCount = curriculum.filter((lesson) => lesson.href).length;
export function learningSummary(state: LessonState) {
  const completed = stages.filter((_, index) => sectionStatus(state, index) === 'Completed').length;
  const started = state.visited.length > 0 || completed > 0 || Object.keys(state.answers).length > 0;
  const complete = isLessonComplete(state);
  return { completed, started, complete, status: complete ? 'Completed' : started ? 'In progress' : 'Not started',
    action: complete ? 'Revisit lesson' : started ? 'Continue lesson' : 'Start lesson', stage: stages[state.stage] ?? stages[0] };
}
