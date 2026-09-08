import { stages } from '../lesson/content';
import { hasExperimentEvidence, isLessonComplete, sectionStatus, useLesson, type LessonState } from '../lesson/lessonState';
import { foundations, isFoundationId } from '../lesson/foundations/content';
import { foundationComplete, foundationSectionStatus, hasFoundationEvidence, useFoundations } from '../lesson/foundations/state';
import type { FoundationId } from '../lesson/foundations/types';

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
  foundationMetadata('measurement'),
  { id: 'superposition', number: '02', title: 'Superposition & the Hadamard gate',
    description: 'Start with one qubit. Predict what happens, build your first circuit, and discover why two H gates change everything.',
    difficulty: 'Beginner', outcomes: ['Read amplitudes and probabilities', 'Build and test H and H → H', 'Explain interference from your observations'],
    href: '/learn/superposition', format: '9 sections · 2 experiments' },
  foundationMetadata('phase'), foundationMetadata('entanglement'),
];
function foundationMetadata(id: FoundationId): LessonMetadata {
  const lesson = foundations[id];
  return { ...lesson, href: `/learn/${id}`, difficulty: 'Beginner', format: `${lesson.sections.length} sections · ${lesson.experiments.length} ${lesson.experiments.length === 1 ? 'experiment' : 'experiments'}` };
}
export const availableLessonCount = curriculum.filter((lesson) => lesson.href).length;
export function learningSummary(state: LessonState) {
  const completed = stages.filter((_, index) => sectionStatus(state, index) === 'Completed').length;
  const started = state.visited.length > 0 || completed > 0 || Object.keys(state.answers).length > 0;
  const complete = isLessonComplete(state);
  return { completed, started, complete, status: complete ? 'Completed' : started ? 'In progress' : 'Not started',
    action: complete ? 'Revisit lesson' : started ? 'Continue lesson' : 'Start lesson', stage: stages[state.stage] ?? stages[0] };
}
export function useCurriculumProgress() {
  const original = useLesson(); const additional = useFoundations();
  return curriculum.map((lesson) => {
    if (!isFoundationId(lesson.id)) return { ...lesson, ...learningSummary(original),
      stageIndex: original.stage, sections: stages.map((title, i) => ({ title, status: sectionStatus(original, i) })),
      experiments: Number(hasExperimentEvidence(original, 'h')) + Number(hasExperimentEvidence(original, 'hh')), experimentCount: 2 };
    const id = lesson.id; const s = additional[id]; const definition = foundations[id];
    const sections = definition.sections.map((section, i) => ({ title: section.title, status: foundationSectionStatus(id, s, i) }));
    const completed = sections.filter((section) => section.status === 'Completed').length;
    const started = sections.some((section) => section.status !== 'Not started') || Object.keys(s.answers).length > 0;
    const complete = foundationComplete(id, s);
    return { ...lesson, completed, started, complete, status: complete ? 'Completed' : started ? 'In progress' : 'Not started',
      action: complete ? 'Revisit lesson' : started ? 'Continue lesson' : 'Start lesson', stage: definition.sections[s.stage]!.title,
      stageIndex: s.stage, sections, experiments: definition.experiments.filter((e) => hasFoundationEvidence(id, s, e.id)).length, experimentCount: definition.experiments.length };
  });
}
