import type { SimulationRequest } from '../../api/types';
import type { Question } from '../content';

export type FoundationId = 'measurement' | 'phase' | 'entanglement';
export type Visual = 'bit' | 'basis' | 'shots' | 'signs' | 'global' | 'interference' | 'pairs' | 'cx' | 'bell' | 'mixed';
export interface LessonSection {
  title: string;
  paragraphs: string[];
  visual?: Visual;
  equation?: { notation: string; explanation: string };
  detail?: { title: string; text: string };
  check?: Question;
  experiment?: string;
  review?: string;
}
export interface ExpectedStep { amplitudes: number[]; bloch: [number, number, number][] }
export interface ExperimentDefinition {
  id: string;
  title: string;
  numQubits: SimulationRequest['numQubits'];
  gates: { type: 'h' | 'x' | 'z' | 'cx'; target: number; control?: number }[];
  prediction: Question;
  instructions: string[];
  observations: string[];
  expected: ExpectedStep[];
}
export interface FoundationLesson {
  id: FoundationId;
  number: string;
  title: string;
  description: string;
  outcomes: string[];
  sections: LessonSection[];
  experiments: ExperimentDefinition[];
  quiz: Question[];
  next: { href: string; title: string };
}
