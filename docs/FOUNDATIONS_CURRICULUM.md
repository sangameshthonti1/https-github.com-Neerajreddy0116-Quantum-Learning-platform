# Foundations curriculum milestone

## Review location and repository state

Review the dashboard at **http://127.0.0.1:5173/** or go directly to:

- **http://127.0.0.1:5173/learn/measurement**
- **http://127.0.0.1:5173/learn/phase**
- **http://127.0.0.1:5173/learn/entanglement**

The branch was `prebuild/foundations-curriculum` and the working tree was clean
before editing. This implementation remains uncommitted on that branch. No
branch changes, commits, pushes, resets, publication, or deployment were performed.
The pre-existing development servers on 5173/8000 were left running.

The backend, API contract document, request/response TypeScript types, backend
configuration, package manifest, and lockfile are unchanged. No dependency,
gate, simulator, authentication, database, or AI service was added.

## Learning sequence and outcomes

| Order | Lesson | Outcomes | Experiments |
| --- | --- | --- | --- |
| 01 | Qubits and measurement | Explain bits and qubits without the hidden-bit misconception; read basis states; prepare zero/one; explain measurement and sampling | Empty, X(q0), H(q0) |
| 02 | Superposition and the Hadamard Gate | Original nine-section lesson and completion behavior preserved | H(q0), H(q0) → H(q0) |
| 03 | Phase and interference | Explain amplitude signs, Z, global versus relative phase; connect cancellation and reinforcement to later measurements | H → H, H → Z → H |
| 04 | Entanglement and Bell states | Read q1 q0 labels; build controlled-X; distinguish correlation from entanglement; explain pure joint and mixed reduced states | H(q0) → CX(q0 → q1) |

Each new lesson has eight freely accessible sections, seven checked concept or
observation questions, and a five-question deterministic quiz. Explanations lead
into concept sketches, worked examples, recorded predictions, independent
construction, real result review, and interpretation checks. The new lessons
require all these checks, their verified experiments, and a perfect quiz attempt
for completion. A visit or Next click never gives completion credit. A prediction
need not be correct; comparing it with evidence is part of learning.

Scientific/educational review specifically addressed:

- Measurement produces a classical record and leaves a single qubit in the
  corresponding basis state in the ideal computational measurement. Every Lab
  shot starts preparation afresh. Explorer snapshots are before measurement.
- A qubit carries amplitude information beyond uncertainty about a classical bit.
  Coin and signed-arrow analogies have explicit limits.
- The Z lesson separates its unchanged probability bars from the changed relative
  amplitude sign. A global minus on every amplitude preserves predictions under
  identical later operations. Matrix notation is optional and explained in words.
- Bell labels use q1 q0, with q0 on the right. All three snapshots are inspected.
  The pure joint Bell state is never depicted as two independent pure qubits.
- Matching counts and centered local spheres alone cannot prove entanglement.
  The known noiseless preparation and full coherent joint state establish it in
  this model. This is not a physical Bell-inequality test.

The phase distinction was cross-checked against IBM's
[limitations on quantum information](https://quantum.cloud.ibm.com/learning/en/courses/basics-of-quantum-information/quantum-circuits/limitations-on-quantum-information).
The Bell reduced-state explanation was cross-checked against IBM's
[multiple systems and reduced states](https://quantum.cloud.ibm.com/learning/en/courses/general-formulation-of-quantum-information/density-matrices/multiple-systems).

## Reusable architecture

`lesson/foundations/types.ts` defines lesson metadata, outcomes, sections,
questions, experiments, construction instructions, and expected scientific
assertions. `content.ts` supplies the three lesson definitions. Expected values
are validation assertions and labeled worked examples; they are never substituted
for simulator output or used to generate counts.

`FoundationLesson.tsx` supplies navigation, status, focus management, explanatory
content, the existing `QuestionCard`, experiment launch links, result reviews,
and completion rules. `FoundationQuiz.tsx` stores complete submitted attempts and
retains earned passes across retries. Concept-check attempts are also retained.
`ConceptVisual.tsx` implements lightweight native-button diagrams for bits, label
ordering, signs, global phase, interference, and joint/reduced views. Diagrams
cannot generate progress or experimental evidence.

`CollectedResults.tsx` reuses `ProbabilityBars`, `StatevectorTable`, and
`BlochSphere`. Probabilities/amplitudes/spheres follow the selected archived
trace snapshot; counts always describe the final circuit measurement. The source
request and full numerical response are available in expandable details.

`FoundationLabGuide.tsx` connects all six new exercises to the one existing
`CircuitLab`, canonical editor, `/api/simulate`, and `/api/simulate/trace`.
There is no new execution path or frontend simulator. All new drafts start empty;
students place gates with the palette/canvas or insertion form. Templates remain
available as an existing Lab recovery aid.

The original superposition renderer, state, quiz, evidence rules, and storage
remain in place. Its visible lesson number changed to 02. The Lab's original
superposition guide continues to handle its two exercises.

The React review kept stable component boundaries, lazy lesson loading,
functional state updates, one canonical circuit, and subscription cleanup.
Native form controls preserve keyboard behavior and explicit submissions.

## State isolation and integrity

Each additional lesson uses its own versioned key:

- `qlp-foundations-measurement-v1`
- `qlp-foundations-phase-v1`
- `qlp-foundations-entanglement-v1`

Each stores section visits, submitted answers, concept attempts, predictions,
quiz drafts/attempts, experiment drafts, and collected evidence. The original
`qlp-superposition-v1` stays separate. Initialization of a dashboard, catalog, or
progress view does not create lesson visits.

The editor's workspace identity is `measurement:empty`, `measurement:x`,
`measurement:h`, `phase:hh`, `phase:hzh`, or `entanglement:bell`. Existing
superposition `h`/`hh` and `free` identities are preserved. These identities also
separate draft restoration and in-memory undo histories. Ordinary Lab/Explorer
links resume the active workspace; `/lab?workspace=free` restores free work.
Malformed explicit exercise links do not silently open another lesson.

Evidence collection checks:

1. Exact qubit count, gate count/types/order, targets and controls.
2. Exact executed request identity including gate IDs, shots, backend, and seed
   for both the simulation snapshot and the trace snapshot.
3. Existing API response validation, matching simulation shot/gate counts and
   seed, gate identity in each trace step, and all required intermediate/final
   amplitudes and reduced Bloch vectors within `1e-10`.
4. A recorded prediction and inspection of the initial state plus every gate
   step in the current trace. Retrying the trace resets its inspection credit.
5. No in-flight request, failed request, stale/cancelled trace, pending CX
   placement, or unapplied shot edit.

Archived evidence carries its lesson and experiment IDs. Restoration revalidates
evidence and drafts rather than trusting a TypeScript cast of stored JSON.
Malformed storage recovers safely. No successful result is invented during an
outage. Current-run failures block collection; already collected evidence remains
a historical record for its original circuit.

Friendly formatting preserves returned numerical precision in expandable JSON.
JSON storage canonicalizes signed zero to zero; this has no scientific effect.
The original live trace details retain the HTTP response text as before.

## Verification and real observations

`npm run build` passed, including the full TypeScript check and production bundle.
The original 58 browser tests passed after integration; their catalog assertions
were updated for four available lessons and their superposition links were scoped
to the correct card. No original regression cases were removed.

The final full browser suite **passed all 84 tests in 3.1 minutes**, with no
retries: the original 58 plus 26 new cases. All six complete desktop/mobile
journeys passed. TypeScript and the production build passed on the final source.

The new real Chromium checks cover all routes/free navigation; 320px keyboard
navigation; six complete desktop/390px mobile journeys; independent gate
construction; all six experiments; selected statevectors and Bloch views;
deterministic quizzes/retries; immutable archived responses; dashboard/catalog/
progress; free/guided draft isolation; separate attempts; a fresh tab; blocked or
malformed storage; wrong gates/order/control/target; stale settings and IDs;
delayed responses; bad trace identity and phase; trace retry inspection; and an
actual stopped-backend outage followed by recovery.

Observed with Qiskit 2.5.2 / Aer 0.17.2, 1,024 shots, seed 42:

| Circuit | Ideal final probabilities, display precision | Actual sampled counts |
| --- | --- | --- |
| Empty, one qubit | 0: 100%; 1: 0% | 0: 1024; 1: 0 |
| X(q0) | 0: 0%; 1: 100% | 0: 0; 1: 1024 |
| H(q0) | 0: 50%; 1: 50% | 0: 526; 1: 498 |
| H → H | 0: 100%; 1: 0% | 0: 1024; 1: 0 |
| H → Z → H | 0: 0%; 1: 100% | 0: 0; 1: 1024 |
| H(q0) → CX(q0 → q1) | 00: 50%; 11: 50%; 01/10: 0% | 00: 526; 11: 498; 01/10: 0 |

The H sampling comparison repeated seed 42 and reproduced 526/498; seed 43
returned 515/509 with the same ideal probabilities. These are observed samples,
not required hardcoded counts or a cross-version reproducibility guarantee.

For H → Z → H, the trace showed amplitudes approximately (+0.7071,+0.7071),
then (+0.7071,−0.7071), then (0,1). The Bloch direction changed +X → −X → −Z.
The Z step retained 50/50 probabilities; the last H made 1 certain.

Bell's trace showed:

| Step | Joint amplitudes in 00,01,10,11 order | q0 vector | q1 vector |
| --- | --- | --- | --- |
| Initial | (1,0,0,0) | (0,0,1) | (0,0,1) |
| H(q0) | (0.7071,0.7071,0,0) | (1,0,0) | (0,0,1) |
| CX(q0 → q1) | (0.7071,0,0,0.7071) | (0,0,0) | (0,0,0) |

Both final reduced matrices were approximately `[[0.5,0],[0,0.5]]`, giving
purity 0.5. The joint state is a single normalized Bell statevector, so its joint
purity is 1. Tiny floating-point residuals are handled with tolerance.

All three routes were also opened in Chromium on the actual review server
5173, with correct titles/eight sections, no horizontal overflow, no page errors,
and a 200 backend health response. Screenshots were visually inspected on desktop
and mobile. Review corrected cramped mobile section navigation, clarified
measurement collapse/shot preparation, corrected the insertion-form instructions,
and removed the conflicting H suggestion from the empty-circuit exercise.

The browser-verification skill's `agent-browser` CLI was unavailable; installed
Playwright Chromium supplied browser checks and screenshots. Test artifacts are
in ignored `frontend/test-results/`. Additional reviewed screenshots are
`/private/tmp/quantum-foundations-review-{measurement,phase,entanglement}-desktop.png`
and `/private/tmp/quantum-foundations-review-mobile.png`.

## Files changed

| Files | Change |
| --- | --- |
| `frontend/src/lesson/foundations/types.ts`, `content.ts` | Shared definitions and all three curricula |
| `frontend/src/lesson/foundations/state.ts` | Per-lesson session state, grading/progress, restoration, evidence validation |
| `frontend/src/lesson/foundations/FoundationLesson.tsx`, `FoundationQuiz.tsx` | Shared learning journey and understanding checks |
| `frontend/src/lesson/foundations/ConceptVisual.tsx`, `CollectedResults.tsx`, `foundations.css` | Educational diagrams, real archived result review, responsive styling |
| `frontend/src/lesson/foundations/FoundationLabGuide.tsx` | Guided construction and exact-response collection |
| `frontend/src/App.tsx`, `app/AppShell.tsx` | New lazy routes, route titles and focused shell |
| `frontend/src/app/curriculum.ts`, `Pages.tsx`, `design-system.css` | Four-lesson availability, actual learning path and progress |
| `frontend/src/app/workspace.ts` | Lesson-qualified experiment identities |
| `frontend/src/lab/CircuitLab.tsx`, `CircuitCanvas.tsx`, `useCircuitEditor.ts` | Guided draft integration, contextual empty hint, reusable draft validation |
| `frontend/src/api/client.ts`, `traceClient.ts` | Reuse existing validators; check simulation seed/gate metadata against the request |
| `frontend/src/lesson/SuperpositionLesson.tsx` | Display lesson number 02 |
| `frontend/e2e/foundations.spec.ts` | 26 new browser tests |
| `frontend/e2e/app-shell.spec.ts` | Update catalog availability and disambiguate superposition actions |
| `frontend/README.md`, `docs/FOUNDATIONS_CURRICULUM.md` | Current usage and implementation/verification report |

## Limits

Progress is **session-only**. There is no durable account record or cross-device
sync. Closing a tab normally ends its session; browser session restoration may
retain it. Blocked storage falls back to memory, which is lost on refresh. This
is client-side educational progress, not tamper-proof certification.

Experiments use the existing noiseless, terminal-measurement backend. The trace
is mathematical access to pre-measurement states; it is not quantum hardware
tomography, a collapse trajectory, or a physical entanglement certification.
New tabs opened with an opener may inherit browser session storage by browser
design; independent fresh tabs start with no lesson progress.

Browser automation used Chromium, including desktop/mobile viewports and reduced
motion. Firefox, Safari/WebKit, and assistive-technology hardware were not tested.
Undo history and uncollected results remain local to the app lifetime/Lab mount
as before. No deployment or production proxy configuration was performed.
