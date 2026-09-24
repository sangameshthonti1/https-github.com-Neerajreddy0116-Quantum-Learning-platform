import type { LibraryDownload, LibrarySource } from "./types";

export const libraryUpdated = "24 September 2026";

export const textbook: LibrarySource = {
  title:
    "Quantum Computation and Quantum Information, 10th Anniversary Edition",
  author: "Michael A. Nielsen and Isaac L. Chuang",
  note: "Standard reference used to check notation, unitary gates, measurement, and multi-qubit state descriptions.",
};

export const suppliedNotes = (title: string): LibrarySource => ({
  title,
  note: "User-provided beginner notes. Reorganized topic-wise, with repeated material consolidated and scientific qualifications added.",
});

export const download = (label: string, file: string): LibraryDownload => ({
  label,
  href: `/library/sources/${file}`,
});
