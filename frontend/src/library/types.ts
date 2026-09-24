export interface LibrarySource {
  title: string;
  author?: string;
  url?: string;
  note?: string;
}

export interface LibraryDownload {
  label: string;
  href: string;
}

export interface LibraryCheck {
  question: string;
  options?: readonly string[];
  answer: string;
}

export interface LibrarySubsection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  equation?: { notation: string; explanation: string };
}

export interface LibrarySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  equation?: { notation: string; explanation: string };
  note?: { title: string; text: string };
  subsections?: readonly LibrarySubsection[];
  checks?: readonly LibraryCheck[];
}

export interface LibraryTerm {
  term: string;
  definition: string;
}

export interface LibraryTopic {
  slug: string;
  title: string;
  summary: string;
  byline?: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  updated: string;
  terms: readonly LibraryTerm[];
  sections: readonly LibrarySection[];
  sources: readonly LibrarySource[];
  downloads?: readonly LibraryDownload[];
  relatedSlugs?: readonly string[];
  local?: boolean;
}
