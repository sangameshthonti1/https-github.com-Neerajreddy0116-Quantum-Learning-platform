# Local app-shell milestone

## Checkpoint and scope

The existing checkout was `prebuild/state-explorer` at `78326cc`. Neither requested
branch existed. All 16 lesson source/test/documentation files were preserved on
`prebuild/lesson-superposition`, checked for whitespace, secrets and generated
files, and committed locally as **`0694d35` — Build guided superposition lesson
and free navigation**. TypeScript, production build and all **38 baseline browser
tests passed** before that commit. The worktree was verified clean before
creating **`prebuild/app-shell`** from this checkpoint.

App-shell work is intentionally uncommitted for review. No backend, API contract,
package, lockfile, remote, deployment or account changes are part of this milestone.

## Implementation plan and decisions

The starting app selected three independent pages from `window.location`; normal
links reloaded the document, duplicated brand headers, and lost ordinary Lab
circuits. Lesson evidence already had careful snapshot validation and session
storage, so the integration preserves that mechanism.

The shell adds small History API navigation with native-link semantics, lazy
pages, a metadata-driven catalog, and one visual language. The scientific editor,
API clients, trace hook, gate canvas, quiz grading and evidence checks remain the
existing implementations. No router, icon, animation, font or visualization
dependency was added.

Design: deep navy navigation, off-white reading surfaces, blue primary actions,
restrained cyan in educational diagrams, slate text and semantic status colors.
The dashboard combines a split educational hero, a current lesson card, actual
session progress, and two workspace links. Its SVG is explicitly a conceptual
illustration, independent of learner state or simulator output. Its three buttons
explain preparation, the H transformation, and measurement. Duration estimates
are omitted because they have not been measured; section/experiment counts are
used instead.

The global sidebar is 226px on content pages and defaults to a 72px rail for the
lesson and Lab. Expansion on focused pages overlays the content. The existing
Lab panel switch at 1000px is preserved; global mobile navigation uses a native
modal dialog below 761px. Keyboard wrapping, Escape, focus return, active routes,
reduced motion, and skip navigation are supported. The Circuit Test link lives
in the Lab footer, outside student navigation.

## Route map

| Route | Behavior |
| --- | --- |
| `/`, `/dashboard` | Student dashboard, honest first visit/continue states |
| `/learn` | Foundations catalog, available/all filters, learning outcomes |
| `/learn/superposition` | Existing complete nine-section lesson |
| `/lab` | Existing Circuit Lab, resuming the last workspace |
| `/lab/states` | Same Circuit Lab in State Explorer mode; trace is explicitly requested |
| `/lab?lesson=superposition&experiment=h` | Restore/open the independent one-H exercise |
| `/lab?lesson=superposition&experiment=hh` | Restore/open the independent H→H exercise |
| `/lab?workspace=free` | Explicitly return to the preserved free-exploration circuit |
| `/progress` | Actual section statuses and collected-experiment count |
| `/algorithms`, `/challenges` | Honest upcoming states with working learning/Lab links |
| `/circuit-test` | Preserved developer integration page with isolated document navigation |
| Unknown route | Recovery page linking to Dashboard |

Trailing slashes work. Existing `/?lesson=superposition&experiment=h|hh` bookmarks
still open the guided Lab. Ordinary `/` now opens Dashboard. Browser Back/Forward
updates the app, and links retain modifier-key/new-tab behavior.

## Component and file architecture

| Files | Responsibility |
| --- | --- |
| `frontend/src/app/design-system.css` | Tokens, type scale, buttons, badges, segmented controls, cards, navigation, responsive composition and scoped bridges to existing lesson/Lab styles |
| `frontend/src/app/ui.tsx` | Local SVG icons, Badge, ActionLink, PageHeading and EmptyState primitives |
| `frontend/src/app/AppShell.tsx` | Sidebar/rail, topbar, page context, drawer, collapse preference, focus and route titles |
| `frontend/src/app/navigation.tsx` | Location subscription, native-compatible Link and imperative navigation |
| `frontend/src/app/Pages.tsx` | Dashboard, Curriculum, Progress, Upcoming and NotFound pages; shared progress overview |
| `frontend/src/app/QuantumVisual.tsx` | Lightweight, interactive, labelled conceptual SVG |
| `frontend/src/app/curriculum.ts` | Lesson metadata and derived learning summary |
| `frontend/src/app/workspace.ts` | Last active free/guided workspace context with in-memory fallback |
| `frontend/src/App.tsx` | Explicit route composition and lazy loading |
| `frontend/src/lab/useCircuitEditor.ts` | Existing reducer plus validated session draft restoration and per-workspace in-memory undo history |
| `frontend/src/lab/CircuitLab.tsx` | Explicit exercise/mode props, shared links, workspace persistence and quieter developer footer |
| `frontend/src/lesson/SuperpositionLesson.tsx` | Shared client links and actual lesson-entry visit tracking |
| `frontend/src/lesson/LessonLabGuide.tsx` | Client return navigation and collapsible construction instructions |
| `frontend/src/lesson/LessonQuiz.tsx` | Completion link targets the new Lab route using client navigation |
| `frontend/src/lesson/lessonState.ts` | Fresh sessions start with no visits; opening the lesson records the first visit |
| `frontend/e2e/app-shell.spec.ts` | Shell, catalog, direct routes, responsive navigation, draft isolation and real-engine journeys |
| Existing Lab/Explorer specs | Entry URL updated from `/` to `/lab`; all original assertions retained |

The React review checked stable component boundaries, hook order, lazy page
loading, subscription cleanup, canonical state ownership, native controls and
keyboard navigation. Existing native Lab inputs, result tabs, gate buttons and
lesson question components consume shared tokens through scoped CSS; they were
not replaced by a second component implementation.

## State and integrity

- The existing `qlp-superposition-v1` state keeps visits, readings, submitted
  predictions, checks, quiz drafts/attempts, exercise drafts and collected evidence.
  Dashboard/catalog/progress visits do not create lesson activity.
- `qlp-circuit-free-v1`, `qlp-circuit-h-v1`, and `qlp-circuit-hh-v1` store current
  canonical requests. Stored free drafts are validated before restoration.
  Guided drafts continue to use the lesson's existing storage as their source
  when opening a fresh document.
- Three independent in-memory histories retain the last 100 undoable edits per
  workspace across client navigation. Reload restores the circuit, not undo
  history. Choosing a guided exercise does not replace the free circuit.
- `qlp-active-workspace-v1` remembers which workspace ordinary Lab/Explorer links
  resume. The explicit Free exploration link switches context while preserving
  both drafts. `qlp-navigation-collapsed` is a local display preference only.
- Simulation/trace results and uncollected inspection credit remain local to a
  Lab mount. Leaving the Lab aborts in-flight work. On return, run and inspect
  again before collecting; saved evidence remains a separate immutable record.
- Both exact-request matching and stale/race/error protections remain in place.
  Navigation never substitutes for prediction, inspection, evidence, or grading.
- If storage is blocked, in-memory lesson state and circuit histories survive
  client navigation; refreshing or leaving the document loses that fallback.
  Tab sessions are not account records and are not synchronized across devices.

## Verification and review

Commands from `frontend/`: `npm run typecheck`, `npm run build`,
`npm run test:e2e`. Tests run against owned local Vite/Chromium/Qiskit processes
on 5174/8001, leaving the existing development servers on 5173/8000 intact.

TypeScript and production build passed. The full integrated suite passed
**58 tests (38 existing + 20 new)**, including both real-engine walkthroughs.

New tests cover first-visit honesty, catalog filtering and availability, nine
direct route cases, 320/390/768px navigation, modal focus/Escape, collapse
persistence, focused canvas width, browser history, circuit reload, free/guided
draft isolation, blocked and malformed storage, unknown routes, and complete
desktop/mobile real-simulation journeys. The original 38 tests retain simulation,
drag/drop, editor, State Explorer, free lesson navigation, graded attempts,
completion, invalid responses, stale evidence and actual backend outage coverage.

Real screenshots were captured and visually inspected for Dashboard, Learn,
lesson and Lab at 1440px and 390px. Review identified and corrected a mobile
focused-sidebar margin, page-container focus outline, and drawer keyboard wrap.
Guided Lab instructions now expand on demand to give the canvas and trace more
space. At 1440px the central workspace is 888px wide, and overlay expansion does
not shrink it. Screenshots and failure traces live in ignored `frontend/test-results/`;
additional development screenshots were saved under `/private/tmp/quantum-*`.
The agent-browser CLI was unavailable; the repository's installed Playwright
Chromium provided the real browser checks instead.

Review URL: **http://127.0.0.1:5173/**. Future lessons, algorithms and challenges
are explicitly upcoming. Authentication, durable accounts, analytics, AI tutoring,
additional algorithms and backend changes remain outside this milestone.
