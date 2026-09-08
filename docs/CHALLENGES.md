# Challenges and verified grading

This milestone provides independent circuit challenges at `/challenges`, using the existing Circuit Lab, Qiskit Aer simulator and State Explorer. No AI provider or API key is needed. All grading runs locally on the backend.

## Trusted collection

The authoritative, versioned catalog is `backend/app/services/challenge_catalog.py`. Public definitions and private reference circuits are separate. Reference circuits are used by tests and are not returned by the public catalog. The frontend does not contain a second catalog or simulator.

| ID | Challenge | Learning objective | Success criterion |
| --- | --- | --- | --- |
| `flip` | A change of bit | Change a definite zero into one | Full state `|1⟩` |
| `superposition` | Two possibilities | Equal amplitudes with the same relative phase | Full state `(|0⟩ + |1⟩)/√2` |
| `interference` | Bring it back | Recombine a prepared superposition | Keep the provided H, then reach `|0⟩` |
| `phase` | The minus makes a difference | Change relative phase | Full state `(|0⟩ − |1⟩)/√2` |
| `bell` | Connected possibilities | Entangle two qubits | Full state `(|00⟩ + |11⟩)/√2` |
| `ghz` | Three in harmony | Extend entanglement across three qubits | Full state `(|000⟩ + |111⟩)/√2` |
| `unwind` | Untangle the pair | Reverse entangling operations in order | Keep H(q0), CX(q0→q1), then reach `|00⟩` |
| `opposites` | Always opposite | Construct a joint measurement distribution | `P(01)=P(10)=0.5`; other probabilities zero; phase unrestricted |

Each definition includes difficulty, objective, statement, initial preparation, canonical starting circuit, allowed gates, limits, target, three progressive hints, tolerance and scoring text. Single-qubit tasks allow H/X/Z; multi-qubit tasks also allow CX. All retain the existing 256-gate resource limit, rather than imposing optimal gate counts. Every challenge is immediately available.

All physical circuits start at all-zero. Prepared states are represented by explicit prefix gates in the canonical circuit, so Lab simulation, State Explorer and grading see the same state at every step. Students can edit the prefix with the normal editor, but grading verifies its operations, order and wires independently. Gate IDs are not part of the educational prefix constraint. Reset restores the setup and is undoable.

## HTTP contract

- `GET /api/challenges`: public challenge definitions; no reference circuits.
- `POST /api/challenges/grade`: accepts only `challengeId`, `submissionId`, and `circuit` (the existing `SimulationRequest`).

Example request:

```json
{
  "challengeId": "flip",
  "submissionId": "unique-client-request-id",
  "circuit": {
    "numQubits": 1,
    "gates": [{"id": "g1", "type": "x", "targets": [0], "controls": []}],
    "shots": 1024,
    "backend": "qiskit",
    "seedSimulator": 42
  }
}
```

The response binds `challengeId`, `challengeVersion`, `submissionId`, the exact canonical `circuit`, and a SHA-256 `circuitDigest` to `valid`, `targetAchieved`, `score`, comparison metrics, violated constraints, deterministic feedback, optional hint/trace-step suggestion, and actual pre-measurement amplitudes and probabilities. The digest identifies content; it is not an authentication signature.

Schema violations return the existing sanitized HTTP 422 validation shape. Unknown challenges return 404. A well-formed circuit violating challenge constraints receives structured feedback with `valid=false` and score 0. A wrong qubit count has no comparison metrics because it belongs to a different state space. A same-size circuit may reach the target while violating its required preparation: `targetAchieved=true`, `valid=false`, score 0. Completion requires both booleans. Simulator failures return 503 and never contain a grade.

Existing `/api/simulate` and `/api/simulate/trace` contracts are unchanged.

## Mathematics and scoring

The grader calls the existing `simulate_circuit` Aer service. It uses its complete ideal statevector saved before terminal measurement. The internal run uses one unused sample and a fixed seed to bound work; neither counts nor sampling settings enter grading. The submitted snapshot retains the student's original shots and seed.

Before comparison, statevectors must be finite, have dimension `2^n`, and have squared norm within `1e-10` of 1. Only accepted floating-point norm drift is normalized; materially invalid states fail closed.

For pure-state goals:

`F = |⟨target|actual⟩|²`

This fidelity is unchanged under any common complex phase. Success is `1 − F ≤ 1e-10`. Equal measurement probabilities do not imply equal states: Bell-plus and Bell-minus have the same probabilities but zero fidelity. Feedback explicitly explains this case.

For the explicitly distribution-only challenge:

`D_TV = ½ Σ_b |P_actual(b) − P_target(b)|`

Probabilities are exact squared amplitudes. Success is `D_TV ≤ 1e-10`; relative phase is unrestricted. The comparison is over the joint distribution, not separate qubit marginals. State-target feedback also reports this distance diagnostically, but it cannot replace fidelity.

Score is 100 only for a valid circuit achieving its target. Otherwise valid circuits receive `floor(100 × similarity)`, capped at 99. Similarity is fidelity for states, or `1 − D_TV` for distributions. A `1e-9` point adjustment before floor corrects floating-point drift at integer boundaries; it never changes completion or permits an unsuccessful score of 100. Constraint violations score 0. Hints, gate efficiency, sampling noise and attempt count do not penalize scores.

## Drafts, snapshots and session ownership

`useCircuitEditor` retains the canonical request, last 100 undoable edits and redo history. Challenge work uses `challenge:<id>` workspace keys and distinct `qlp-circuit-challenge:<id>-v1` session-storage entries. Free Lab and all guided lesson drafts retain their original keys. Entering a challenge does not change which guided/free Lab workspace navigation remembers. Templates are omitted from challenge work to avoid loading the answer by default.

Each grading request clones the canonical circuit and captures a revision counter. The client validates response shape, physical values, challenge identity, submission identity and the echoed full circuit before showing a result. Editing after submission labels feedback stale. Editing and then undoing while a request is pending still invalidates that in-flight request for progress. New submissions abort and replace prior requests; sequence/identity checks also prevent late responses from overwriting newer ones. Unmounting cancels requests. Late stale results can be inspected but cannot update completion or best scores. A previously earned completion remains historical when the student later experiments further.

Challenge progress uses a separate `qlp-challenges-v1` session store with an in-memory fallback. It records submission count (including retries, unavailable requests and superseded requests), hint count, best verified evidence, last current verified evidence and first completion time. Merely visiting a challenge or revealing a hint earns no completion. The dashboard and Progress page keep challenge records separate from lesson records. Refresh retains valid stored evidence and circuit drafts; undo history survives app navigation but not a full refresh, matching the original editor behavior.

These are personal tab-session records, not certificates. Browser storage is user-controlled and is not a tamper-proof account record. The backend never accepts local scores, completion flags or numerical simulation results as grading input. Closing a tab normally ends the session, although browser restoration may retain it. There is no authentication, database, cross-device synchronization or leaderboard. Offline catalog/grade requests show recoverable errors; the app does not synthesize fallback grades.

## Verification and local inspection

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
cd ../frontend
npm run typecheck
npm run build
npm run test:e2e
```

Backend coverage includes all eight reference circuits, incorrect starting circuits, arbitrary global phases, wrong relative phases with identical probabilities, distribution-only acceptance, joint-vs-marginal probabilities, preparation validation, gate/qubit/resource limits, normalization/tolerances, deterministic scoring, rejection of injected scoring claims, simulator failures, and compatibility with both existing simulation APIs.

The real-browser challenge suite exercises catalog/filter/navigation, construction and real simulations for single-qubit/Bell/GHZ circuits on desktop and mobile, target/evidence basis ordering, correct/incorrect grades, hint progression, preparation/reset, phase-only distribution equivalence, stale/late/superseded requests, outage/retry/malformed-response handling, session restoration, lesson/free draft isolation, blocked storage, keyboard operation, narrow layouts and screenshots. Existing browser suites remain enabled.

No dependencies were added. No paid AI calls are part of grading or these walkthroughs.

## Verified milestone results — 2026-09-08

Implemented on `prebuild/challenges`. No commits, pushes, publishing or deployments were performed. The existing local servers were left running; a separate preview serves the updated backend.

| Check | Actual result |
| --- | --- |
| Complete backend suite | **490 passed** (414 existing + 76 challenge tests) |
| `pip check` | No broken requirements found |
| TypeScript check | Passed |
| Production build | Passed |
| Complete browser suite | **118 passed** (99 existing + 19 challenge tests) |
| Final frontend module split | **39 affected browser tests passed again**; build/typecheck passed again |
| Independent preview walkthrough | Flip, Bell and GHZ constructed, simulated, traced and graded; no browser page errors or AI requests |
| Visual review | Desktop and mobile screenshots inspected; binary-basis ordering corrected; mobile settings condensed; feedback spacing refined |
| Whitespace review | `git diff --check` passed |

The React best-practices review removed a circular module dependency and separated lightweight target/progress components from the editor. The catalog now loads Circuit Lab only when a workspace is opened.

| Real browser submission | Score | State fidelity | Total variation distance |
| --- | --- | --- | --- |
| Flip: X(q0) | 100 | 1 | 0 |
| Bell: H(q0), CX(q0→q1) | 100 | 1 | 1.1102230246251565e−16 |
| Bell with wrong phase: H(q0), CX(q0→q1), Z(q1) | 0 | 1.232595164407831e−32 | 1.1102230246251565e−16 |
| GHZ: H(q0), CX(q0→q1), CX(q1→q2) | 100 | 1 | 1.1102230246251565e−16 |

All eight reference constructions passed server tests. The tiny nonzero residuals above are floating-point effects, interpreted using the documented tolerance.

Preview: **http://127.0.0.1:5189/challenges**. API documentation: **http://127.0.0.1:8910/docs**. Live AI is explicitly disabled in this preview. The existing backend on port 8000 was not restarted, so use the separate preview URL to inspect this milestone.

Independent review artifacts are in `/private/tmp/qlp-challenges-final-review`: `verified-examples.json`, catalog desktop/mobile screenshots, flip/Bell/GHZ desktop screenshots, GHZ mobile screenshot, wrong-phase feedback screenshot, and the progress screenshot. These are temporary local artifacts, not published files. The in-app Browser connection was unavailable; the walkthrough used the project's installed real Playwright Chromium browser. Mobile tests use viewport emulation, not physical devices.

To reproduce the standalone browser review while the preview is running:

```sh
cd frontend
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/challenge-walkthrough.mjs http://127.0.0.1:5189 /private/tmp/qlp-challenges-review
```

## File manifest

New backend files:

- `backend/app/schemas/challenges.py`: strict public catalog/request/feedback schemas.
- `backend/app/services/challenge_catalog.py`: trusted eight-challenge catalog and private reference circuits.
- `backend/app/services/challenges.py`: constraint validation, normalization, exact-state/distribution comparisons, deterministic scores and feedback.
- `backend/app/api/routes/challenges.py`: public catalog and grading endpoints.
- `backend/tests/test_challenges.py`: 76 mathematical, contract and security cases.

New frontend files:

- `frontend/src/challenges/types.ts`: wire types.
- `frontend/src/challenges/api.ts`: catalog fetching, grading client, cancellation/timeouts and response validation.
- `frontend/src/challenges/progress.ts`: isolated session-local evidence and progress.
- `frontend/src/challenges/Challenges.tsx`: catalog, filters, featured challenge and workspace routing.
- `frontend/src/challenges/TargetVisual.tsx`: correctly ordered target amplitudes/probabilities.
- `frontend/src/challenges/ChallengeGuide.tsx`: goal, progressive hints, snapshot submissions, feedback and evidence.
- `frontend/src/challenges/ChallengeProgressSummary.tsx`: lightweight dashboard/progress integration.
- `frontend/src/challenges/challenges.css`: responsive visual design and reduced-motion support.
- `frontend/e2e/challenges.spec.ts`: 19 real browser tests, including desktop/mobile walkthroughs.
- `frontend/scripts/challenge-walkthrough.mjs`: reproducible local review and evidence capture.

Modified existing files:

- `backend/app/api/router.py`: register challenge routes.
- `frontend/src/App.tsx`: lazy challenge routing.
- `frontend/src/app/AppShell.tsx`: activate Challenges navigation and focused workspace shell.
- `frontend/src/app/Pages.tsx`: separate challenge records on Dashboard and Progress.
- `frontend/src/lab/CircuitLab.tsx`: optional challenge context around the existing editor, challenge reset and grading integration.
- `frontend/src/lab/useCircuitEditor.ts`: optional saved-draft preference for isolated challenge workspaces.
- `frontend/e2e/app-shell.spec.ts`: replace the outdated “upcoming challenges” expectation with the eight available challenges.

This document is the new milestone design, contract and verification report. Dependency manifests, existing lesson implementations, simulator/trace contracts, and Tutor implementation are unchanged.
