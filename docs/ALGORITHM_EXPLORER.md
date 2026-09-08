# Algorithm Explorer — implementation and review

Local review: **http://127.0.0.1:5181/algorithms**. FastAPI runs on
`127.0.0.1:8011` with `QLP_AI_ENABLED=false`. These are local review processes,
not a deployment. Branch: `feat/algorithm-explorer`, based on `a617215`.
All milestone changes remain uncommitted.

## Resumption checkpoints

The initial clean-tree baseline was independently established: **891 backend
tests**, **137 browser tests**, TypeScript, and `pip check` passed. The first
browser attempt could not bind a port inside the sandbox; the authorized local
server/Chromium run then passed.

At the first interruption, the backend catalog, schemas, builders, endpoints,
129 mathematical/API tests, frontend API validation, experiment state hook, and
isolated Lab handoff existed. The backend test's maximum gate estimate was
corrected from 46 to 58 after inspecting real constructions. The frontend route
still referenced an uncreated page. After resuming, the lesson and result views
were added. At the next interruption, those files were confirmed complete on
disk; the page assembly and stylesheet remained missing. They were subsequently
completed without recreating existing work or changing branches.

## Supported experiments

Deutsch–Jozsa supports **all promised Boolean functions on one or two input
bits**, with one additional helper qubit. This is 4 one-bit and 8 two-bit
functions (12 configurations):

| Oracle ID | Rule | One input bit | Two input bits |
| --- | --- | --- | --- |
| `zero` | Always 0 | `00` | `0000` |
| `one` | Always 1 | `11` | `1111` |
| `q0` | Rightmost input bit | `01` | `0101` |
| `not-q0` | Complement of q0 | `10` | `1010` |
| `q1` | Leftmost input bit | Unsupported | `0011` |
| `not-q1` | Complement of q1 | Unsupported | `1100` |
| `xor` | Bits differ | Unsupported | `0110` |
| `xnor` | Bits agree | Unsupported | `1001` |

Table entries list function outputs for input strings in ascending binary order:
`0,1` or `00,01,10,11`. The first two rules are constant; the others are balanced.
No non-promised functions or custom executable oracle definitions are accepted.

Grover supports **one or two data qubits**, respectively two or four items,
**exactly one marked bitstring**, and **0–4 complete iterations**. All items are
selectable, including `00`. Zero iterations is the uniform-state baseline. The
two-item case deliberately demonstrates the 50% boundary: standard iterations
do not improve success. Three-data-qubit search is deferred.

Existing engine limits remain **1–3 total qubits, 256 gates, 1–8192 shots**, and
unsigned 32-bit simulator seeds. Algorithm circuits use at most 9 gates for
Deutsch–Jozsa and 58 for Grover. The UI offers 128, 1024, or 8192 shots with seed
42; the API accepts every supported shot count and either a supported seed or
null for a fresh seed. No new dependencies, simulator, AI provider, database,
authentication, or code execution mechanism was added.

## Trusted construction and execution

`algorithm_catalog.py` contains the two catalog entries and the explicit oracle
allowlist. `algorithms.py` has small dedicated construction branches and a shared
gate/stage accumulator. Extending the collection means adding a bounded request
variant, a catalog entry, a builder, and interpretation logic; there is no
general execution framework or client-defined Python.

For Deutsch–Jozsa, inputs occupy q0 through q(n−1), with helper qn, where n is
the number of input bits. The circuit applies X to the helper, H to every qubit,
the reversible oracle, and final H gates **only to the inputs**. All these small
promised functions have the form `f(x) = parity(mask & x) XOR offset`. Each mask
bit becomes a CX from that input to the helper; an offset of 1 adds X to the
helper. The always-zero oracle is a genuine identity, with a zero-gate stage.
The operation preserves x and maps helper y to `y XOR f(x)`.

Grover prepares H on each data qubit. The phase oracle applies X to marked-item
zero positions, Z (one qubit) or CZ (two), then undoes those X gates. This maps
only the marked basis amplitude to its negative. The diffuser sandwiches the
all-zero phase flip between H layers. Its matrix is **−D**, where
`D = 2|s⟩⟨s| − I` and |s⟩ is uniform. That overall minus sign is physically
irrelevant but is retained in every raw trace. Full operator tests verify this
decomposition, rather than comparing probabilities alone.

The existing `simulate_circuit` provides real Aer sampling and the saved
pre-measurement statevector. The existing `trace_circuit` evolves every gate and
computes reduced qubit states. The algorithm service checks agreement between
these two final statevectors at absolute tolerance `1e-10`. It returns no
partial result if either engine path fails or they disagree.

Deutsch–Jozsa interpretation marginalizes actual ideal probabilities and counts
over the helper. All-zero input probability near 1 means constant; near 0 means
balanced; anything else is inconclusive. Catalog category is never used to
decide the run's classification. Grover's success is the marked entry of the
actual ideal distribution; sampled success is the actual marked count divided
by shots. Iteration comparisons use recorded uniform/diffuser trace boundaries.
No result chart is populated from a formula or predefined array.

The public bit order stays **`q[n-1]...q[0]`**, where n here denotes the total
qubit count. q0 is rightmost. For two-input Deutsch–Jozsa, full outcome `100`
means helper q2=1 and input q1q0=00, so it identifies constant under the promise.
The interface explicitly separates these registers.

## API additions

| Method and path | Purpose |
| --- | --- |
| `GET /api/algorithms` | Two entries, register limits, oracle labels and truth tables |
| `POST /api/algorithms/build` | Validated selection → canonical circuit and stage boundaries; no execution |
| `POST /api/algorithms/run` | Same selection → definition, Aer simulation, full trace, and interpretation |

Example request bodies:

```json
{"algorithm":"deutsch-jozsa","inputQubits":2,"oracleId":"q1","shots":1024,"seedSimulator":42}
```

```json
{"algorithm":"grover","numQubits":2,"markedItem":"10","iterations":1,"shots":1024,"seedSimulator":42}
```

Shots default to 1024 and seed to null when omitted. Other selection fields are
required. Unknown fields, invalid oracle/register combinations, malformed marks,
booleans in integer fields, out-of-range shots/seeds/iterations, and unsupported
algorithms return sanitized HTTP 422 validation issues. Execution failures
return HTTP 503 with the existing `simulation_failed` error shape.

Definitions include `version`, exact `parameters`, `circuit`, SHA-256
`circuitDigest`, `stages`, `inputRegister`, `ancillaQubit`, `oracle`, and `bitOrder`.
The digest covers canonical request JSON, including shots and requested seed.
For a null seed the actual generated seed is recorded in execution metadata.
Stages use trace indices: gates with `startStep < index <= endStep` belong to
that stage. Step 0 is the initial all-zero state. Equal boundaries identify an
identity stage.

`simulation` and `trace` are unchanged nested instances of the existing response
contracts; `/api/simulate`, `/api/simulate/trace`, and the restricted OpenQASM
parser retain their existing behavior. The HTTP endpoints run synchronously in
FastAPI's existing worker-pool boundary.

## Learning experience and state integrity

Routes are `/algorithms`, `/algorithms/deutsch-jozsa`, and `/algorithms/grover`.
The catalog is now available in the application navigation. Each module follows
problem → classical intuition → quantum idea → circuit → prediction → run →
inspection → explanation → understanding check. Deeper mathematics is optional.

Students can query individual inputs of the classical Boolean box, reveal its
full truth table, choose the register/oracle or marked item/iteration count,
preview every gate, record a prediction (including uncertainty), run real
Qiskit, switch ideal probabilities/counts, inspect amplitudes and the Bloch
sphere, use stage shortcuts and the per-gate timeline, and retry understanding
checks. The circuit preview, State Explorer, probability bars, amplitude table,
Bloch sphere, and question component reuse existing implementations. Text is
deterministic and the experience works with live AI disabled.

Results retain their exact parameter/circuit snapshot. Selection changes clear
results, traces, answers, and predictions. Active executions are aborted and
controller identity is checked before any response can update the UI. Circuit
preview requests also cancel on revision/unmount. Runtime validation verifies
parameters, gate snapshots, trace structure, normalization, simulation/trace
agreement, register marginals, counts, and displayed success metrics before
rendering scientific data. A corrupted or mismatched response produces an error.

“Open a copy in Circuit Lab” stores the generated source and opens
`/lab?algorithm=<id>&snapshot=<digest>`. The editable workspace key is
`algorithm:<id>:<digest>`, independent of free, lesson, and challenge keys. An
existing copy resumes its own saved edits. Lab edits never modify algorithm
results. The copy has its own Undo/Redo, Code Mode, simulation, and State
Explorer, plus “Return to algorithm” and “Open free exploration” links. A
missing/corrupt source gives recovery instead of replacing the free draft.

Parameter selections and Lab drafts survive reload in tab-session storage.
Results and algorithm answers survive client navigation in memory; reload
requires another run and starts new Undo history, matching the Lab convention.
Algorithm practice does not award foundation/challenge progress. Storage failure
has an in-memory fallback; a copied URL alone cannot transfer a tab's source
snapshot to another browser/tab without that storage.

The React review informed request cancellation, complete snapshot identity,
reusing existing components, and keeping session data scoped to the experiment.
The browser-verification CLI was unavailable, so the existing Playwright and
Chromium installation performed all real checks without another dependency.

## Observed real numerical results

The dedicated preview walkthrough used Qiskit 2.5.2, Aer 0.17.2, 1024 shots, and
seed 42. Each case ran on desktop and mobile.

| Experiment | Actual ideal result | Actual sampled counts |
| --- | --- | --- |
| Two-input DJ, always 1 | Input `00`: 1.0 → constant | Full `000`: 526, `100`: 498; input `00`: 1024 |
| Two-input DJ, return q1 | Input `10`: 0.9999999999999998; input `00`: 3.4564e−32 → balanced | Full `010`: 526, `110`: 498; input `10`: 1024 |
| Four-item Grover, mark `10`, one iteration | Marked probability 1.0 | `10`: 1024 |
| Same search, two iterations | Marked probability 0.25 | `00`: 257, `01`: 269, `10`: 264, `11`: 234 |

The last sampled success frequency is 264/1024 = 25.78125%, distinct from the
25% ideal probability. Trace observations for 0 through 4 Grover iterations
round to 25%, 100%, 25%, 25%, 100%. Raw values remain unrounded in technical
details and evidence files.

Evidence: `/private/tmp/qlp-algorithm-review/verified-algorithms.json` plus desktop,
390px mobile, and catalog 320/390/768px screenshots in that directory. The
walkthrough verifies that changed oracles/iteration counts remove old results
and checks for browser errors, framework overlays, and AI requests.

Reproduce against the running local preview:

```sh
cd frontend
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/algorithm-walkthrough.mjs http://127.0.0.1:5181 /private/tmp/qlp-algorithm-review
```

## Verification

Final verification on the completed source:

| Check | Actual outcome |
| --- | --- |
| Full backend `python -m pytest -q` | **1,020 passed** in 18.62s: 891 existing + 129 algorithm tests |
| `python -m pip check` | **No broken requirements found** |
| Frontend `npm run typecheck` | **Passed** |
| Frontend `npm run build` | **Passed**, production bundle generated |
| Full `QLP_AI_ENABLED=false npm run test:e2e` | **161 passed** in 5.1m: 137 existing + 24 algorithm tests |
| Final live preview walkthrough | **8 scenarios passed** across desktop and mobile; zero browser errors and zero AI requests |
| `git diff --check` | **Passed** |
| Dependency manifests and lockfile | **Unchanged**, no dependencies added |

The full suites retain simulation, trace, Code Mode, four foundations lessons,
eight challenges, application navigation, progress, draft/Undo behavior, and
Tutor/provider-boundary regressions. Deliberate outage tests produce expected
connection/proxy logs; the successful live walkthrough has none.

The added backend tests cover every promised oracle, all computational-basis
inputs and both helper values, complete phase-oracle/diffuser matrices, phase
kickback, complement/global-phase equivalence, all marks and 0–4 iterations,
the independent sine-squared formula, normalization, input marginalization,
strict bounds, untrusted extra fields, failures, and original API agreement.

The added browser tests execute actual Qiskit responses. Coverage includes both
algorithms, all four marks, register-size boundaries, sampled counts, classical
queries, predictions/check retries, timeline/Bloch views, late previews and
executions, parameter invalidation, isolated Lab copies, corrupt/missing storage,
validation errors, altered result contracts, an actual stopped-backend outage,
keyboard controls, reduced motion, and expanded details without page overflow at
320, 390, and 768 pixels. The pre-existing algorithm navigation test was updated
to assert two available modules instead of the former Upcoming placeholder; its
route/navigation assertions remain.

Initial browser test failures exposed an accessible-name mismatch from a
decorative footer arrow and a test looking for a nonexistent sphere selector
label. The arrow is now excluded from the accessible name, and the test uses the
existing qubit buttons. No scientific output was replaced with a mock to make a
test pass. Deliberately altered response tests verify rejection, and Tutor's
existing provider-double tests remain explicit test doubles.

## Files and limits

New backend files: `app/schemas/algorithms.py`, `app/services/algorithm_catalog.py`,
`app/services/algorithms.py`, `app/api/routes/algorithms.py`, and
`tests/test_algorithms.py`. `app/api/router.py` registers the new routes.

New frontend files under `src/algorithms/`: `types.ts`, `api.ts`,
`useExperiment.ts`, `workspace.ts`, `Algorithms.tsx`, `AlgorithmLesson.tsx`,
`AlgorithmResults.tsx`, and `algorithms.css`. Existing `App.tsx`,
`app/AppShell.tsx`, `lab/CircuitCanvas.tsx`, `lab/CircuitLab.tsx`,
`lab/StateExplorer.tsx`, and `lab/lab.css` provide routing, read-only preview,
embedded tracing, and the isolated handoff. Tests: new `e2e/algorithms.spec.ts`,
new `scripts/algorithm-walkthrough.mjs`, and the navigation expectation in
`e2e/app-shell.spec.ts`. Documentation: this report, both READMEs, and API contract.

Limits: ideal local simulation only; one mark; no generalized Boolean oracle
compiler, multi-mark Grover, noise/hardware execution, three-data-qubit search,
QAOA, VQE, accounts, database, paid AI configuration, or permanent algorithm
completion records. Session results require rerunning after refresh. Iteration
comparisons show only the boundaries actually executed in the selected run.
Simulator wall-clock time on these tiny cases is not a practical speedup claim.

The mathematical conventions were cross-checked with IBM's primary
[Deutsch–Jozsa lesson](https://quantum.cloud.ibm.com/learning/en/courses/fundamentals-of-quantum-algorithms/quantum-query-algorithms/deutsch-jozsa-algorithm)
and [Grover tutorial](https://quantum.cloud.ibm.com/docs/en/tutorials/grovers-algorithm).
The implementation and numerical evidence use the repository's installed engine.

No paid AI calls were made. No commit, push, merge, publish, or deployment was
performed. The review website is left running for the integration lead.
