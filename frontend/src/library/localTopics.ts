import { useSyncExternalStore } from "react";
import type {
  LibrarySection,
  LibrarySource,
  LibraryTerm,
  LibraryTopic,
} from "./types";

const storageKey = "qlp-library-local-topics-v1";
let topics = readTopics();
const listeners = new Set<() => void>();

function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function validSections(value: unknown): value is LibrarySection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30)
    return false;
  return value.every(
    (section) =>
      section &&
      typeof section === "object" &&
      text((section as LibrarySection).id, 100) &&
      text((section as LibrarySection).title, 180) &&
      Array.isArray((section as LibrarySection).paragraphs) &&
      (section as LibrarySection).paragraphs.length > 0 &&
      (section as LibrarySection).paragraphs.length <= 100 &&
      (section as LibrarySection).paragraphs.every((paragraph) =>
        text(paragraph, 6000),
      ),
  );
}

function validTopic(value: unknown): value is LibraryTopic {
  if (!value || typeof value !== "object") return false;
  const topic = value as LibraryTopic;
  return (
    topic.local === true &&
    /^[a-z0-9-]{3,160}$/.test(topic.slug) &&
    text(topic.title, 160) &&
    text(topic.summary, 1200) &&
    text(topic.category, 80) &&
    ["Beginner", "Intermediate", "Advanced"].includes(topic.level) &&
    text(topic.updated, 80) &&
    (!topic.byline || text(topic.byline, 120)) &&
    Array.isArray(topic.terms) &&
    topic.terms.length <= 40 &&
    topic.terms.every(
      (term) => text(term.term, 100) && text(term.definition, 1000),
    ) &&
    validSections(topic.sections) &&
    Array.isArray(topic.sources) &&
    topic.sources.length <= 40 &&
    topic.sources.every(
      (source) =>
        text(source.title, 300) &&
        (!source.url ||
          (text(source.url, 1000) && /^https?:\/\//.test(source.url))),
    )
  );
}

function readTopics(): readonly LibraryTopic[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter(validTopic) : [];
  } catch {
    return [];
  }
}

function persist(next: readonly LibraryTopic[]) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  topics = next;
  listeners.forEach((listener) => listener());
}

export function useLocalLibraryTopics() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => topics,
    () => [],
  );
}

export function saveLocalTopic(input: {
  title: string;
  byline: string;
  summary: string;
  category: string;
  level: LibraryTopic["level"];
  terms: LibraryTerm[];
  sections: LibrarySection[];
  sources: LibrarySource[];
}) {
  const base =
    input.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "local-topic";
  const topic: LibraryTopic = {
    ...input,
    slug: `${base}-${Date.now().toString(36)}`,
    updated: new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(
      new Date(),
    ),
    local: true,
  };
  persist([...topics, topic]);
  return topic;
}

export function removeLocalTopic(slug: string) {
  const next = topics.filter((topic) => topic.slug !== slug);
  if (next.length === topics.length) return false;
  persist(next);
  return true;
}
