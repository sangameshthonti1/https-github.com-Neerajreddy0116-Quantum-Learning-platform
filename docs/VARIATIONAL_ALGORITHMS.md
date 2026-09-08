# Task 21 — real VQE and QAOA

Implementation on `feat/variational-algorithms`, based on verified integration
checkpoint `d1ad043`. No commit, branch change, dependency upgrade or deployment
is part of this milestone. The existing Qiskit/PennyLane adapters, Deutsch–Jozsa
and Grover builders, lessons, eight authoritative Challenge graders and Tutor
behavior are preserved.

## Resume checkpoint and phases

The interrupted work already contained the bounded schemas, Pauli mathematics,
two-spin VQE ansatz/optimizer and 151 VQE/math tests. Those actual files and test
results were inspected and retained, rather than recreated. After resuming:

1. Finished and tested the supervised job API, cancellation, deadlines and cleanup.
2. Added QAOA's graph catalog, exact cost/mixer decomposition and independent tests.
3. Added both learning modules, request lifecycle guards, isolated Lab copies,
   live recorded convergence, final State Explorer integration and browser tests.
4. Updated the API/setup/architecture documentation and ran regression checks.

Baseline before this milestone: **1,782 backend tests**, **181 browser tests**,
TypeScript and production build passed; `pip check` reported no broken requirements.
Phase A's 151 math + 29 process tests passed; Phase B's 216 math + 31 process
tests passed before frontend expansion. Final verification is recorded below.

## Dependencies and architecture

No dependencies were installed, added, removed or upgraded. The existing Python
**3.13.7**, NumPy **2.5.3**, SciPy **1.18.1**, Qiskit **2.5.2**, Aer **0.17.2** and
PennyLane **0.45.1** environment is used. Powell and small dense diagonalization
are already available in SciPy. No chemistry or optimization framework was added.

The implementation is deliberately small:

| File / boundary | Responsibility |
| --- | --- |
| `backend/app/schemas/variational.py` | Discriminated trusted requests, finite bounds, Pauli/graph validation, response models |
| `backend/app/services/pauli_math.py` | Pauli tensor matrices, phase-sensitive expectation, exact diagonalization |
| `backend/app/services/maxcut.py` | Four trusted graphs, cost terms, exhaustive classical cut reference |
| `backend/app/services/variational.py` | Parameter ordering/binding, canonical stage builders, one real Powell loop, final scientific result |
| Existing `get_simulator(backend)` adapters | Real exact trace states and final sampled simulation; no new simulator |
| `variational_worker.py`, `variational_jobs.py` | Bounded JSON worker protocol, one owned process, admission, status, actual cancellation/deadline/reaping |
| `backend/app/api/routes/variational.py` | Focused catalog, build and job routes, shared sanitized validation |
| `frontend/src/variational/` | API types/validation, request lifecycle, learning UI, convergence, final state and isolated Lab source snapshots |

The app factory installs manager lifespan cleanup; the API router mounts the
namespace; CORS allows its GET/POST/DELETE operations only for configured origins.
The existing simulation services and their numerical conventions are untouched.

For an objective evaluation, the selected adapter traces the canonical bound
circuit and its actual final complex state is used in `ψ†Hψ`. Qiskit's established
exact trace engine is **`qiskit.quantum_info.Statevector`**; the final sampled
simulation is **Aer**. PennyLane uses **`pennylane.default.qubit`** for both exact
state evaluation and separate final finite-shot simulation. Metadata explicitly
distinguishes these paths. There is no fallback or relabelled Qiskit-as-PennyLane.
Obtaining a full small trace per evaluation adds modest overhead but reuses the
verified adapter boundary. Only the final circuit's full trace is returned.

To add another trusted problem later, define and validate its bounded operator,
canonical parameterized builder, exact reference, interpretation and independent
tests. A future simulator would implement the existing simulator adapter boundary
and parity tests. Neither arbitrary problem input nor additional simulators are
implemented here; there is no plugin system.

## Mathematics and bit ordering

For `H = Σ cᵢPᵢ`, each coefficient is real, finite and bounded. Internal definitions
allow 1–3 qubits and 1–8 unique I/X/Y/Z words, each exactly the qubit count long;
coefficients lie in [−4,4]. Matrices use left-to-right Kronecker products in
**q[n−1]…q[0]** order, with q0 the rightmost/least-significant bit. For example,
`IX` is X on q0, not q1. Tests cover every one-, two- and three-qubit Pauli word
against an independent bit-flip/phase construction.

`E = numpy.vdot(psi, H @ psi).real` uses all complex amplitudes. State dimension,
normalization, operator dimension, finite values and Hermiticity are checked;
an imaginary expectation outside tolerance is an execution error. X and Y
expectations cannot be inferred from computational-basis probabilities: |+⟩/|−⟩
and |+i⟩/|−i⟩ respectively demonstrate identical probabilities but opposite
expectations. The dense classical reference uses SciPy `eigh`, not the optimizer.
See the [official Hermitian eigensolver API](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.eigh.html).

Tolerance is **1e−10** for physical consistency; dense-unitary/parity tests
also use **1e−12** where appropriate. Global-phase-aware comparisons use state
projectors `|ψ⟩⟨ψ|`, and native complex phases/serialization are preserved.
PennyLane's device wire ordering remains explicitly mapped by its existing
adapter; see [PennyLane state ordering](https://docs.pennylane.ai/en/stable/code/api/pennylane.state.html)
and [Qiskit Pauli conventions](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.quantum_info.SparsePauliOp).

## VQE example

Problem `ising-pair` is an **educational transverse-field two-spin model**, with
dimensionless energies:

`H = −IX − XI + 0.5 ZZ`

In basis `00,01,10,11`, its independent explicit matrix is

```text
 0.5  -1   -1    0
 -1  -0.5   0   -1
 -1    0  -0.5  -1
  0   -1   -1   0.5
```

Eigenvalues: `−√17/2, −0.5, +0.5, +√17/2`. The exact ground energy is
**−2.061552812808830…**. This is not a molecular example or a claim of chemistry
accuracy. The ansatz can represent entangled real two-qubit states:

1. RY(θ0) q0, RY(θ1) q1.
2. CX q0 → q1.
3. RY(θ2) q0, RY(θ3) q1.

Parameter order is exactly `[θ0, θ1, θ2, θ3]`, all radians, each bounded to
[−π,π]. Default seeded initial angles are drawn uniformly from [−π/2,π/2] using
NumPy `default_rng(initializationSeed)`. Explicit finite initial parameters are
also accepted. The optimizer minimizes energy, records **every** objective call
including the initial one, and returns the best actually observed state, not
merely the optimizer's last trial. The exact reference never supplies parameters
or replaces a quantum objective evaluation.

For normalized trial states, `E(θ) ≥ E₀` up to numerical tolerance. An energy
below that bound outside tolerance is rejected. Convergence does not certify a
global minimum. With seed 42 and a 256-evaluation/12-iteration budget:

| Simulator | Initial energy | Best energy | Gap to E₀ | Evaluations / iterations | Stop |
| --- | ---: | ---: | ---: | --- | --- |
| Qiskit | −0.356894439447308 | −2.061552811126675 | 1.682155e−9 | 224 / 5 | converged |
| PennyLane | −0.356894439447308 | −2.061552811126676 | 1.682154e−9 | 232 / 5 | converged |

Qiskit best parameters:
`[-0.46765281369278555, 1.0026505290323438, 1.9732917777879795, 0.517915431455386]`.
PennyLane best parameters:
`[-0.46765283116368866, 1.0026505251158278, 1.973291781945296, 0.5179154339789797]`.
Slight line-search differences are expected; cross-framework optimized parameter
vectors and evaluation counts are not required to be bit-identical. Fixed bound
circuits are checked for physical state parity.

## QAOA examples and decomposition

All edges are undirected, unique and positively weighted; vertex numbers are
logical qubits. No graph can be supplied from HTTP.

| Problem ID | Vertices | Edges (weight) | Exact maximum | Optimal bitstrings |
| --- | --- | --- | ---: | --- |
| `edge` | 0,1 | 0–1 (1) | 1 | 01,10 |
| `path` | 0,1,2 | 0–1 (1),1–2 (1) | 2 | 010,101 |
| `triangle` | 0,1,2 | 0–1 (1),0–2 (1),1–2 (1) | 2 | all except 000,111 |
| `weighted-path` | 0,1,2 | 0–1 (1),1–2 (2) | 3 | 010,101 |

For each edge, `Cᵢⱼ = wᵢⱼ(I−ZᵢZⱼ)/2`; sum these terms into C. The diagonal value
for a bitstring equals its weighted classical cut. Initial H gates prepare a
uniform superposition. Each of **p = 1 or 2** layers applies cost then mixer:

```text
cost edge i–j: CX(i→j), P(−gamma * weight) on j, CX(i→j)
mixer:        RX(2 * beta) on every vertex
parameter order: [gamma0, beta0, gamma1, beta1] (truncate to 2p)
```

CX computes the bit parity into j, P applies a phase only for parity 1, and CX
uncomputes. This equals `exp(−i gamma w(I−ZiZj)/2)` **including its global phase**.
Equivalently it is `exp(−i gamma w/2) RZZ(−gamma w)`; a plain RZZ decomposition
without that scalar would differ by a global phase. RX(2β) is `exp(−iβX)`;
different-qubit X terms commute. No RZZ gate was added. See the
[official RZZ matrix convention](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.RZZGate)
and the [original QAOA construction](https://arxiv.org/abs/1411.4028).

The minimized objective is **−⟨C⟩**, so best observed expected cut increases.
For one edge at p=1, independently, `⟨C⟩ = (1 + sin(gamma) sin(4 beta))/2`;
`gamma=π/2, beta=π/8` achieves 1. Dense exponential tests cover full cost/mixer
states and every computational-basis input to the cost layer, including complex
phases. Hand-enumerated cut arrays provide separate classical references.

Seed 42, 256 evaluations, 12 iterations, exact (unsampled) objectives produced:

| Graph / depth | Initial expected cut | Qiskit best | PennyLane best | Ideal optimal-cut probability (Qiskit) | Evaluations / iterations |
| --- | ---: | ---: | ---: | ---: | --- |
| edge / 1 | 0.236594228271380 | 0.999999999999618 | 0.999999999999618 | 0.999999999999619 | 42 / 2 |
| path / 1 | 0.564869882515725 | 1.649519052838281 | 1.649519052838282 | 0.668509504628129 | 92 / 3 |
| triangle / 1 | 0.863757907248034 | 1.999999999985398 | 1.999999999985398 | 0.999999999992699 | 143 / 5 |
| weighted-path / 1 | 0.820690206451908 | 2.559208880393608 | 2.559208880393609 | 0.639017377813089 | 92 / 3 |
| triangle / 2 | 0.127684391761464 | 1.999999999999801 | 1.999999999999804 | 0.999999999999901 | 236 / 5 |

All above runs stopped as converged. The path examples visibly retain a nonzero
reference gap: this is genuine optimization evidence, not a fabricated guarantee.
Within each result, probability of an optimal cut sums exact probabilities over
all classically optimal strings. The best sampled candidate considers **only
positive counts**, maximizing cut value, then count, then lexicographically first.
It need not equal the exact maximum. Complementary strings represent the same cut.

## API contract

These routes complement `/api/algorithms`; its existing two-algorithm contract is
unchanged. The UI adds two variational modules to the same catalog/navigation.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/variational` | none | `{version:1, problems:[...], backends:["qiskit","pennylane"], limits:{...}}` |
| `POST /api/variational/build` | VQE or QAOA request below | `VariationalDefinition`; no optimizer or samples |
| `POST /api/variational/jobs/{uuid}` | same request | HTTP 202 `JobSnapshot` |
| `GET /api/variational/jobs/{uuid}` | none | HTTP 200 `JobSnapshot` |
| `DELETE /api/variational/jobs/{uuid}` | none | HTTP 200 snapshot **after** actual worker cleanup |

Minimal requests: `{"algorithm":"vqe"}` or `{"algorithm":"qaoa"}`. Full examples:

```json
{
  "algorithm": "vqe", "problemId": "ising-pair", "backend": "qiskit",
  "initialParameters": null, "initializationSeed": 42,
  "maxIterations": 12, "maxEvaluations": 256, "timeLimitSeconds": 20,
  "shots": 1024, "seedSimulator": 42
}
```

```json
{
  "algorithm": "qaoa", "problemId": "triangle", "depth": 2,
  "backend": "pennylane", "initialParameters": [0.3, 0.2, -0.4, 0.1],
  "initializationSeed": 42, "maxIterations": 12,
  "maxEvaluations": 256, "timeLimitSeconds": 20,
  "shots": 1024, "seedSimulator": 42
}
```

| Field | Default | Validation |
| --- | --- | --- |
| `algorithm` | required | `vqe` or `qaoa`; no unknown keys |
| `problemId` | `ising-pair` / `edge` | matching trusted catalog ID |
| `backend` | `qiskit` | `qiskit` or `pennylane`, no fallback |
| `depth` (QAOA only) | 1 | integer 1–2 |
| `initialParameters` | null | exactly 4 for VQE, 2p for QAOA; finite radians [−π,π] |
| `initializationSeed` | 42 | integer 0…2³²−1; ignored for angle generation when explicit angles are supplied |
| `maxIterations` | 12 | integer 1–20 |
| `maxEvaluations` | 128 API / 256 learning UI | integer 4–256; includes initial evaluation |
| `timeLimitSeconds` | 20 | integer 1–30, including process startup and final state/sampling |
| `shots` | 1024 | integer 1–8192; final samples only |
| `seedSimulator` | 42 | null or integer 0…2³²−1; final within-framework sampling |

Booleans, numeric strings and nonfinite values are rejected as numeric inputs.
Canonical circuits still obey 1–3 qubits / 256 gates; VQE uses 5 gates; the
largest QAOA circuit (triangle, p=2) uses 27. Shared canonical validation is used
after binding. Graphs have at most 3 vertices/3 edges, weights (0,2]; users cannot
submit custom terms/graphs, optimizer code or a worker command.

`VariationalDefinition` fields: `version`, `request` (all defaults explicit),
`problem` (`id,title,units,hamiltonian,graph`), `parameterOrder`, `boundParameters`,
`ansatz`, `objective` (`energy` or `negative-expected-cut`), `circuit` (unchanged
canonical request), `circuitDigest`, `stages` and `reference`. The reference has
`method,value,eigenvalues,cutValues,optimalBitstrings`; unused collections are
empty. A SHA-256 digest binds sorted canonical request/circuit JSON; it identifies
the snapshot, not a security credential. Preview parameters are initial; result
definition parameters are the best observed, while `definition.request` still
records the exact original experiment settings.

Each recorded evaluation has `evaluation` (1-based), `iteration` (completed
Powell outer sweeps at that point), `parameters`, `expectation`, `objective`,
`bestObjective` and `elapsedMs` since the optimizer started. A line search may
evaluate worse points. `bestObjective` is monotonically nonincreasing for both
algorithms because QAOA minimizes the negative expectation. The full history
contains at most 256 entries. SciPy's distinction between iteration and function
evaluation budgets and its bound behavior are documented in the
[official Powell API](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-powell.html).

`JobSnapshot` fields: `jobId,status,request,history,elapsedMs,result,message`.
Job elapsed time starts at admission and includes startup/cleanup; evaluation
and optimization elapsed times start inside the optimizer. Status is `running`,
`completed`, `cancelled`, `timed_out` or `failed`. Only `completed` has a result;
other terminal statuses may retain partial evaluation history but no final
measurement/state presented as a completed run.

The result contains `definition,optimization,simulation,trace,referenceGap,
explanation,cut`. `simulation` and `trace` retain the existing API schemas and
actual selected-backend metadata. `optimization` contains method/version,
`objectiveEngine`, `objectiveSamplingPerformed:false`, initial/best angles and
expectations, evaluation/iteration totals, elapsed time, full history,
`stoppingReason` and `converged`. Completed reasons are `converged`,
`evaluation_limit`, `iteration_limit`, or `optimizer_stopped`. Cancellation and
wall timeout are job statuses, not a claim of optimizer convergence.

`referenceGap` is best energy minus ground energy for VQE, and exact maximum minus
best expected cut for QAOA. `cut` is null for VQE; otherwise it contains
`expectedCut,optimalCutProbability,bestSampledBitstring,bestSampledCut,bestSampledCount`.
Raw values retain precision; UI values are rounded and full JSON is inspectable.

Invalid requests/UUIDs return sanitized HTTP 422 (`detail:[{loc,msg,type}]`).
Application errors use `{error:{code,message}}`: 404 `job_not_found`, 409
`job_id_conflict`, 429 `optimization_busy`, 503 `optimization_unavailable`.
Worker/native/validation failures become a sanitized `failed` job, releasing its
slot. Same UUID + same normalized request is idempotent while retained; a
different request under that UUID conflicts. Unknown/expired IDs never create
jobs through GET or DELETE. Cancelling an already terminal job leaves it terminal.

## Execution safety and frontend identity

Use **one ASGI worker** for this local milestone. Admission permits one owned
optimization subprocess per server process, no queue. The worker reads only
validated bounded JSON, receives no user executable code and emits bounded
JSON-line evaluations/result. Input is limited to 4097 bytes in the owned worker,
individual output lines to 1 MiB, and output frames to the evaluation budget + 1.
OMP/OpenBLAS/MKL thread counts are capped at one in that worker environment.

The parent supervises the entire wall time independently of cooperative Python
checks. Cancellation, timeout and server lifespan shutdown terminate the worker,
escalate to kill after 0.5 seconds when needed, drain pipes and reap it. Terminal
status is published only after cleanup. Tests include a hung worker and one that
ignores SIGTERM. This is real process termination, not just aborting a browser
fetch or abandoning a background thread. Spawn cancellation retains the process
handle for cleanup. See [Python's subprocess lifecycle APIs](https://docs.python.org/3/library/asyncio-subprocess.html).

At most eight jobs are retained, with terminal entries pruned after 600 seconds
(opportunistically on accesses/admission); older terminal entries may be evicted
earlier when capacity is reached. No durable history, database, authentication,
ownership ACLs, public rate limiter or distributed scheduling is introduced.
Multiple ASGI workers would have independent slots/maps and are unsupported for
this UI lifecycle. This service must stay local/loopback; CORS is not security.
Other existing synchronous simulation routes retain their earlier limitations.

The browser knows a random UUID **before POST**. Edits/navigation cancel by that
ID, then cancel again after late acceptance if needed. Generation/identity guards
prevent stale previews, start responses or final polls from replacing the new
experiment. Poll errors request cancellation; a lost connection cannot disable
the server watchdog. Cancellation UI waits for acknowledgement and explicitly
reports when cleanup could not be confirmed. A completed job won by a natural
completion/cancel race remains completed, not falsely labelled cancelled.

Selections are versioned session-local data, validated before restoration.
Preview/optimized Lab snapshots use `qlp-variational-source-*` and their own
workspace IDs; free/lesson/challenge/legacy algorithm drafts are not overwritten.
Navigation preserves existing Lab Undo/Redo; reload retains drafts but resets
Undo history, as before. Variational results/practice answers are module-local
and require a new run after leaving/reloading. Practice awards no progress.

## Verification

Backend verification: **2,032 tests passed** (1,782 preserved baseline + 250 new
variational tests), including the final strict absolute-tolerance rerun. `pip check`
reported **No broken requirements found**. TypeScript and the production build
passed; dependency manifests/locks and both simulator implementations are unchanged.
The final full browser run passed **200 tests** (181 preserved baseline + 19 new)
in 6.5 minutes, with no skipped tests or retries. Tests live in:

- `backend/tests/test_variational_vqe.py`: independent Pauli/state mathematics,
  analytic spectrum, ansatz, genuine Powell history, seeds, variational bound,
  budgets, stopping reasons and cooperative interruption.
- `backend/tests/test_variational_qaoa.py`: independent hand-enumerated cuts,
  dense cost/mixer exponentials, every basis input, analytical edge optimum,
  both depths/engines, full trace/reduced-state/Bloch/purity parity and real optimization.
- `backend/tests/test_variational_jobs.py`: real HTTP workers on both engines and
  algorithms, admission/idempotency, cancellation/deadline/kill/reap/shutdown,
  bounded retention, corrupt output, sanitized validation and CORS.
- `frontend/e2e/variational.spec.ts`: real desktop/mobile VQE/QAOA on both engines,
  graph/depth/manual angles, budgets, convergence/samples/trace, practice,
  backend metadata, persisted selections, isolated editable Lab drafts,
  late-start/final-poll guards, real cancellation, live partial history and response
  corruption checks.

A separate physical parity audit compared four VQE parameter vectors and all
four QAOA graphs at both depths: **12 bound circuits / 159 initial and per-gate
steps**. Maximum absolute differences were **2.220446049250313e−16** for state
projectors, exact probabilities, reduced density matrices and Bloch coordinates;
purity differed by at most **4.440892098500626e−16**. Tests use `rtol=0` with the
stated absolute tolerance; no relative-tolerance loophole is used.

The combined Aer subprocess tests initially hit the sandbox's macOS OpenMP
shared-memory denial (`OMP Error #178`); separate suites and a standalone worker
passed. The full suite passed with approved normal macOS permissions. This was
not fixed by changing the simulator or upgrading packages. The first browser
full run passed 198/199: its sole failure was an older shell assertion that the
catalog contained two cards. It now correctly expects four. A new delayed-start
test also had an interception teardown race; waiting for delivery before removing
the interceptor fixed that test without weakening application guards.

The Browser skill's discovery found no connected browser, and `agent-browser`
was not installed. The existing installed Playwright/Chromium therefore performed
the actual local browser walkthroughs; screenshots were opened and inspected.
The React review skill informed lazy module loading, parallel catalog/preview
requests, versioned minimal session settings, and explicit asynchronous cleanup.

### Actual rendered walkthrough results

All eight combinations of **VQE/QAOA × Qiskit/PennyLane × desktop 1440px/mobile
390px** passed real browser execution: initial preview, prediction, actual Powell
run, convergence, ideal probabilities, sampled counts, step-zero/gate navigation,
statevector, mobile Bloch pane, metadata and understanding check. The new walkthroughs
reported **no page/console errors, no AI requests and no page-wide horizontal
overflow**. Separate runs changed QAOA to the weighted three-vertex path at depth 2
with an explicit initial gamma, and tested the four-evaluation VQE stopping case.

The final screenshots were visually inspected: clear exact-reference versus trial
metrics, VQE's nonzero ~1.682e−9 gap, real trial/best convergence lines, readable
mobile axes and angle tables, and usable per-gate state controls. Small mobile
axis text, learning-panel spacing, decimal wrapping and small-gap display were
improved during review. The existing long State Explorer timeline scrolls within
its own panel rather than widening the page.

Real delayed-start/final-poll tests confirmed stale-response protection; a running
PennyLane depth-2 QAOA job displayed actual partial objective history before final
completion. Cancellation was acknowledged server-side, and a subsequent real job
could run. Both algorithms' optimized Lab copies preserved the free draft and
its navigation-local Undo/Redo, retained their own edits after reload, and opened
the existing State Explorer. All legacy algorithm, simulator, lesson, Challenge,
Code Mode, State Explorer and Tutor regressions passed.

Artifacts from the final run are in `frontend/test-results/`, including
`variational-real-*/{result,convergence,state}.png` and attached actual result JSON.
Playwright replaces that ignored output directory on a later run. The owned Vite
and FastAPI test servers shut down; ports 5174/8001 had no listeners afterward.
Git remains at `d1ad043` on `feat/variational-algorithms`, with the implementation
uncommitted for integration-lead review. No commit, push, merge, publish or
deployment was performed. No required Task 21 work remains.

### Changed files for integration review

New backend files: `app/schemas/variational.py`, `app/api/routes/variational.py`,
`app/services/{pauli_math,maxcut,variational,variational_jobs,variational_worker}.py`,
and `tests/test_variational_{vqe,qaoa,jobs}.py`.

New frontend files: `src/variational/{types.ts,api.ts,useVariational.ts,workspace.ts,
Variational.tsx,VariationalResults.tsx,variational.css}` and `e2e/variational.spec.ts`.

Existing code touched: backend `app/api/router.py`, `app/core/cors.py`, `app/main.py`;
frontend `src/App.tsx`, `src/app/AppShell.tsx`, `src/algorithms/Algorithms.tsx`,
`src/algorithms/workspace.ts`; catalog availability assertions in
`e2e/algorithms.spec.ts` and `e2e/app-shell.spec.ts`. The broadening of the Lab
workspace type changes only the shared circuit-carrying shape, not the Lab editor.

Documentation: backend/frontend READMEs, `docs/API_CONTRACT.md`, this report,
and historical-baseline notices in `docs/ALGORITHM_EXPLORER.md` and
`docs/PENNYLANE_BACKEND.md`. No requirement pins or package lockfiles changed.

All reference and numerical results above came from actual local executions.
No fake benchmark, molecular accuracy, hardware execution, guaranteed optimizer
success or quantum speedup is claimed. Finite-shot/noisy objectives, arbitrary
Hamiltonians/graphs, chemistry infrastructure, automatic multistart, remote jobs,
QPU execution and public deployment remain intentionally out of scope.
