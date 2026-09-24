import { foundationTopics } from "./topicsFoundations";
import { predictTopic } from "./topicPredict";
import { samplingTopic } from "./topicSampling";
import { phaseTopic } from "./topicPhase";
import { interferenceTopic } from "./topicInterference";
import { hzhTopic } from "./topicHZH";
import { multiQubitTopic } from "./topicMultiQubit";
import { checksTopic } from "./topicChecks";
import type { LibraryTopic } from "./types";

export type {
  LibraryCheck,
  LibraryDownload,
  LibrarySection,
  LibrarySource,
  LibrarySubsection,
  LibraryTerm,
  LibraryTopic,
} from "./types";

export const libraryTopics: readonly LibraryTopic[] = [
  ...foundationTopics,
  predictTopic,
  samplingTopic,
  phaseTopic,
  interferenceTopic,
  hzhTopic,
  multiQubitTopic,
  checksTopic,
];

export function findLibraryTopic(slug: string) {
  return libraryTopics.find((topic) => topic.slug === slug);
}
