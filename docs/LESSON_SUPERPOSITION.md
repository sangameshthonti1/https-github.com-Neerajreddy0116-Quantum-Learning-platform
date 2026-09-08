# Superposition and the Hadamard Gate

Open **http://127.0.0.1:5173/learn/superposition** with the existing Vite server
and Qiskit backend running. The Circuit Lab toolbar links to the lesson.
The browser-test server uses port 5174 with its own backend on 8001; normal
development stays on 5173 and 8000.

## Component structure and changed files

All teaching components live in `frontend/src/lesson/`:

| File | Responsibility |
| --- | --- |
| `SuperpositionLesson.tsx` | Nine freely accessible sections, explicit progress states, focus management and ungated Back/Next |
| `ConceptStages.tsx` | Beginner explanations, labelled circuit sketches, normalized amplitude demonstration and interference explanation |
| `content.ts` | Section labels, question wording, fixed answer keys, misconception feedback and deterministic scoring |
| `QuestionCard.tsx` | Accessible, initially unselected radio questions; explicit submission; feedback and check retries |
| `LessonLabGuide.tsx` | Instructions within the existing Lab, current-result validation, trace inspection tracking and collection |
| `ExperimentResults.tsx` | Four guided result panels backed by the collected simulation and trace |
| `LessonQuiz.tsx` | Five-question grading, mistake review, retry and completion |
| `lessonState.ts` | Versioned tab-session progress, circuit drafts, immutable collected evidence and experiment validation |
| `lesson.css` | Blue/slate lesson layout, responsive styles, accessible controls and reduced-motion support |

Existing integration points:

- `frontend/src/App.tsx`: lazy lesson route, preserving `/` and `/circuit-test`.
- `frontend/src/lab/CircuitLab.tsx`: optional lesson guidance and draft restoration;
  the same canvas, gate controls, reducer, simulation client and trace hook run
  both experiments.
- `frontend/src/lab/useCircuitEditor.ts`: optional initial request. Normal Lab
  defaults and undo/redo semantics are unchanged.
- `frontend/src/lab/BlochSphere.tsx`: optional beginner presentation, using the
  same SVG and backend coordinates. Normal multi-qubit and technical views
  remain intact.
- `frontend/e2e/lesson.spec.ts`: thirteen lesson browser tests, including free navigation and progress preservation.
- `frontend/README.md`: route and usage entry point.

No backend, API contract, package, dependency, or deployment changes.

## Educational flow

1. Motivate the difference between a bit and a qubit. Define reading/measurement,
   quantum state, gate and circuit in ordinary language.
2. Explain classical bits, computational basis states and ket labels. Check that
   a single reading gives one classical result.
3. Explain each symbol in the state equation, amplitudes, squared magnitudes and
   normalization. One control derives a valid pair of positive amplitudes;
   this is explicitly an arithmetic illustration, not simulation output.
4. Introduce H through words, a circuit sketch and an explained equation.
5. Require an unselected, explicit prediction; reveal specific feedback only
   after submission. Predictions are not scored.
6. Open the existing Lab with one empty qubit. The student places H, runs the
   simulator, traces the circuit and visits the initial and after-H states.
   Reset and existing templates are recovery options.
7. Compare the saved prediction with real probabilities. Read probabilities,
   amplitudes, the state map and counts one panel at a time. Check the distinction
   between ideal probabilities and a finite collection of readings.
8. Predict again before adding a second H. Start with the student's collected
   one-H circuit; construct the second gate, run, inspect and collect. Only then
   explain constructive/destructive interference and the difference from an
   unknown classical bit. No measurement occurs between gates.
9. Answer five fixed questions. Review explanations, retry after mistakes and
   complete with five correct answers and both experiment records.

The beginner review led to four explicit revisions: define statevector before
entering the Lab; explain the boundary of the coin analogy; divide the results
into sequential panels; remove unexplained purity/density-matrix notation from
the beginner sphere view. Essential interference reasoning stays visible, while
the full H amplitude rule is optional. The React best-practices review checked
component boundaries, lazy routing, state snapshots, controlled inputs and
accessible native controls without introducing new dependencies.

Scientific cross-check: [IBM Quantum's single-system quantum information
lesson](https://quantum.cloud.ibm.com/learning/en/courses/basics-of-quantum-information/single-systems/quantum-information)
describes squared amplitude magnitudes, the Hadamard operation, and the effect
of relative signs. The project's existing API contract governs all observations.

## Data integrity

Predictions are recorded before the guided experiment. Collection creates a
separate copy containing the exact request (including ordered gate IDs, qubit
count, shots and seed), prediction, simulation response, trace response and
inspected step indices. It is an archived experiment, never relabelled as a
newer editor revision.

Collection requires the expected one-qubit H or H→H circuit; both validated
API responses must match the current canonical request. Expected probabilities
and the intermediate +X Bloch direction are checked within `1e-10`. The initial
state and every trace step must have been visited. New traces start a new
inspection record, even for an identical request. Loading, pending shot/CX
edits, stale snapshots, failed runs and cancelled/failed traces block collection.
Editing is still allowed during requests. A late simulation response stays
associated with its original request, and existing trace cancellation remains
in force.

All displayed experiment probabilities, amplitudes, counts and sphere positions
come from actual API results. The lesson performs no local circuit simulation.
The existing number formatter uses `1e-10` display tolerance, with full returned
precision available in optional details. The explanatory arithmetic examples
are labelled separately from collected results.

## Observed real results

Qiskit 2.5.2 / Aer 0.17.2, one qubit, 1,024 shots, seed 42:

| Observation | H | H→H |
| --- | --- | --- |
| Ideal probability of zero (Aer) | `0.5000000000000001` | `1` |
| Ideal probability of one (Aer) | `0.4999999999999999` | `3.749399456654644e-33` |
| Sampled zero / one counts | `526 / 498` | `1024 / 0` |
| Trace amplitudes after first H | `0.7071067811865475`, `0.7071067811865475` | Same intermediate values |
| Trace Bloch vector after first H | `(0.9999999999999998, 0, 0)` | Same intermediate vector |

The initial trace has probabilities `(1, 0)` and Bloch direction +Z. The second
H returns to ket zero within numerical precision. Aer and the trace retain
their own small floating-point residuals; the lesson does not overwrite them
with textbook constants. Repeated counts use the configured fixed seed, not an
assumption that every newly executed simulation must give different counts.

## Navigation and progress

All nine sidebar buttons are always available. Back/Next only respect the first
and last section boundaries; unanswered checks, predictions and experiments do
not block browsing. Opening a section records a visit, never completion. The
current section retains `aria-current="step"` and receives heading focus.

The sidebar distinguishes **Not started**, **In progress**, and **Completed**.
The progress bar counts completed sections rather than the highest section
opened. Reading-only sections 1 and 4 have explicit **Mark as read** actions.
Checks, submitted predictions, collected experiment evidence and graded quiz
passes determine the other section statuses. These section statuses are separate
from the unchanged overall lesson rule: both verified experiments and a perfect
graded quiz attempt. Reading acknowledgements add no new completion prerequisites.

Each graded quiz attempt keeps an answer snapshot. Retrying clears only the
editable answer draft, preserving previous attempts and any earned pass. Merely
opening section 9 grants no quiz credit; passing the quiz alone cannot substitute
for either experiment. Existing session data is migrated additively: legacy
graded answers become an attempt; predictions, evidence and earned lesson
completion are retained. The legacy `furthest` value never becomes completion.

Skip-ahead sections explain missing observations without blocking navigation.
The H→H instructions also handle starting without a collected one-H circuit.
Experiment collection still enforces exact current snapshots, prediction,
successful simulation and trace, and inspection of every step.

## Verification

- TypeScript: `npm run typecheck`.
- Production build: `npm run build`.
- Full real-browser suite: `npm run test:e2e`, **38 passed** (25 existing tests
  plus 13 lesson tests). TypeScript and production build also passed after the
  navigation fix.
- Complete desktop and 390px reduced-motion mobile walkthroughs construct H
  and H→H without templates, inspect real simulation/trace values, retry the
  quiz and reach completion. No page errors or horizontal overflow at completion.
- Additional coverage: free section 1→9 access, unfinished Back/Next, no credit
  from navigation, explicit reading completion, legacy session migration,
  preserved quiz attempts/passes and completion on revisit, no preselected predictions,
  feedback visibility, normalized-demo endpoints and keyboard input, draft and
  prediction preservation, reset/undo, wrong gates, extra gates/qubits, stale
  shots and gate IDs, in-flight simulation edits, failed trace/retry inspection,
  direct Lab visits without predictions and a real stopped-backend outage.
- Successful walkthrough screenshots are saved under `frontend/test-results/`.
  The in-app browser connector had no available session; walkthroughs and
  screenshots use the repository's installed Chromium through Playwright.
- `git diff --check` verifies whitespace. Backend files remain untouched.
- Separate interactive Chromium check at the normal development URL: jumped
  section 1→9 with zero completed sections and no quiz credit, used unfinished
  Back/Next, used Enter on mobile sidebar controls, confirmed no horizontal
  overflow, and preserved a prediction and quiz draft through a Lab round trip.
  The isolated browser was closed afterward; the developer's servers and
  browser session were left intact.

## Session scope and future persistence

`sessionStorage` under `qlp-superposition-v1` keeps section visits, explicit reading
acknowledgements, predictions, checks, quiz answers and submitted attempts,
drafts and collected evidence in the same browser tab,
including reloads and lesson↔Lab navigation. This is explicitly not account
progress. It is not secure or authoritative grading storage: a user with browser
developer tools can edit their own session data. It is not synchronized to other
tabs or devices. Closing the tab normally ends the session; browser restore
behavior may retain it. If storage is unavailable, only the current page's
in-memory progress remains.

Undo history and uncollected simulation/trace results remain Lab-local, as
before. Returning to a draft requires running and inspecting again before
collecting it. Previously collected experiments remain readable as historical
records.

Future account progress needs authentication, server-side storage and validation,
versioned lesson attempts, cross-device synchronization, and a deliberate policy
for account-level retry history. Those features are outside this first lesson.

No branch switch, commit, push, publish or deployment was performed. At preflight,
the clean checkout reported `prebuild/state-explorer`, despite the requested
branch name `prebuild/lesson-superposition`; implementation remained on that
existing checkout and is left uncommitted for inspection.
