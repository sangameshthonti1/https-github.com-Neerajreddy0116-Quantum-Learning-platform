# PennyLane second simulator — implementation and verification

Review target: `feat/pennylane-backend`, based on integration checkpoint
`a5eed0350ec412d96ebd3d628e4304e8553255f5`. The initial working tree was clean.
After the connection interruption, the existing edits were inspected and
continued, not recreated. No branch switch, reset, commit, push, merge,
publication or deployment was performed. Changes remain local for integration review.

## Scope and setup

The API now accepts `backend: "qiskit"` (also the omitted-field default) or
`backend: "pennylane"`. These select independent local implementations of the
same validated circuit. Qiskit Aer remains the default and its execution
algorithm is unchanged. There is no automatic fallback between engines.

Use the existing Python 3.13 environment and pinned requirements:

```sh
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pip check
.venv/bin/python -m pytest -q
```

See [backend setup](../backend/README.md), [frontend setup](../frontend/README.md),
and the [API contract](API_CONTRACT.md) for local server commands and request examples.

### Dependency decision

**PennyLane 0.45.1** was selected after reading current official installation,
`default.qubit`, state-ordering and snapshot documentation and inspecting the
actual package metadata/resolution against the existing environment. Its
metadata requires Python ≥3.11 and NumPy ≥2.0. Resolution was constrained by the
existing requirements; compatible CPython 3.13 Apple Silicon wheels were available.
The actual package was installed and executed, not only dependency-resolved.

Verified environment: Python **3.13.7**, Qiskit **2.5.2**, Aer **0.17.2**, NumPy
**2.5.3**, SciPy **1.18.1** on macOS Apple Silicon. No previously installed
dependency changed version, and no frontend dependency or lockfile changed.
Recheck wheel/platform availability on other operating systems; the existing
NumPy/SciPy wheels on this machine target macOS 14+.

Sixteen newly installed distributions, all pinned in `backend/requirements.txt`:

| Distribution | Version | Distribution | Version |
| --- | --- | --- | --- |
| pennylane | 0.45.1 | pennylane-lightning | 0.45.0 |
| appdirs | 1.4.4 | autograd | 1.8.0 |
| autoray | 0.8.4 | cachetools | 7.1.8 |
| certifi | 2026.7.22 | charset-normalizer | 3.5.1 |
| diastatic-malt | 2.15.3 | gast | 0.7.0 |
| networkx | 3.6.1 | requests | 2.34.2 |
| scipy-openblas32 | 0.3.34.237.0 | termcolor | 3.3.0 |
| tomlkit | 0.15.1 | urllib3 | 2.7.0 |

`packaging==26.3` moved from development-only to runtime requirements, without
a version change. Lightning is a required PennyLane distribution dependency;
the application executes **default.qubit**, not Lightning. No JAX, Torch,
PennyLane-Qiskit converter or unrelated upgrade was introduced.

## Architecture and changed files

`SimulationRequest` and its discriminated gate model remain the one canonical
format. Existing validation, resource limits, complex serialization and sanitized
HTTP errors are shared. The response shape is preserved, with framework-specific
metadata variants and validators requiring backend/metadata agreement.

| Area | Files and responsibility |
| --- | --- |
| Shared contracts | `backend/app/schemas/simulation.py`, `trace.py`: two backend names, default, metadata variants; `algorithms.py`: optional backend on both existing parameter variants |
| Adapter boundary | New `backend/app/services/simulators.py`: small immutable pair of simulation/trace callables and explicit two-engine dispatch; new `simulation_errors.py`: common execution failure |
| Qiskit | `qiskit_simulator.py` imports/re-exports the common error type; all execution code retained. `qiskit_trace.py` and `quantum_gates.py` are untouched |
| PennyLane | New `pennylane_simulator.py`: allowlisted native operations, fresh QNodes/devices, analytic state, finite-shot counts, snapshots, reduced-state extraction |
| HTTP and algorithms | `backend/app/api/routes/simulation.py` selects the adapter; `services/algorithms.py` passes the selected backend through existing construction/execution, without rewriting builders or interpretation |
| Frontend boundary | `frontend/src/api/{types,client,traceClient}.ts`: backend names, result metadata, runtime checks against the requested engine; `algorithms/{types,api}.ts`: backend-aware identity and validation |
| Lab | New `SimulatorSelector.tsx`; `CircuitLab.tsx`, `useCircuitEditor.ts`, `CodeMode.tsx`: selection, history/drafts, invalidation and cancellation. `GatePanel.tsx` removes the obsolete disabled selector. `ResultsPanel.tsx`, `StateExplorer.tsx`, `lab.css`, `CircuitTest.tsx`: actual engine labels and compact styling |
| Algorithm UI | `Algorithms.tsx`, `AlgorithmResults.tsx`: reusable selector and actual execution metadata |
| Verification | New `test_pennylane_parity.py`, `test_pennylane_api.py`, `frontend/e2e/simulators.spec.ts`; two original backend assertions updated only for the deliberately optional/default backend field |
| Setup/documentation | Pinned backend requirements; both READMEs; `docs/API_CONTRACT.md`, this report, and a current-extension note on the historical Algorithm Explorer report |

Choosing Qiskit does not import or initialize PennyLane. Each engine owns its
circuit construction and state evolution. PennyLane does not import Qiskit,
convert a Qiskit circuit, infer amplitudes from counts, or replay canned outputs.
Tests deliberately disable Qiskit execution and verify PennyLane still runs.

PennyLane simulation performs an analytic `qml.state()` execution plus a separate
finite-shot `qml.counts(all_outcomes=True)` execution. Tracing instead uses
`qml.snapshots` with a `Snapshot` before all gates and after every gate during
**one** analytic execution. No optimizer crosses those boundaries and no loop
resimulates circuit prefixes. A `qml.Tracker` test verifies the single simulation.
Devices are fresh per execution, with no shared RNG or snapshot state and no
multiprocessing workers (`max_workers=None`).

A future simulator would require a real implementation of these two operations
over the same validated request/result schemas, one explicit dispatch branch,
metadata/name support, and the same parity/API/browser tests. It would also need
its own documented wire ordering and sampling semantics. No third simulator,
general-purpose plugin registry or arbitrary client-supplied operation loader
is implemented.

## Gates and numerical conventions

Both engines support all 16 gates: **H, X, Y, Z, S, S†, T, T†, RX, RY, RZ, P,
CX, CZ, SWAP, CCX**. Canonical JSON names stay lowercase; inverse gates use
`sdg`/`tdg`. Rotations and P take exactly one finite numeric angle in radians,
without reducing modulo 2π. SWAP has two targets and no controls; CCX has two
controls and one distinct target. PennyLane uses the corresponding native gates,
including `PhaseShift`, adjoint S/T, `CNOT`, `SWAP` and `Toffoli`.

The public convention is unchanged: **q[n−1]…q[0]**, with q0 rightmost and least
significant. Device wires and count-measurement wires are explicitly
`[n-1, ..., 0]`; operations retain their logical qubit labels. Statevector index
`i` corresponds to its padded binary basis label. Partial trace uses tensor-axis
index `n-1-q`, and reduced qubits are returned in ascending logical index.

Every trace step, including step zero, returns actual complex amplitudes,
state-derived ideal probabilities, and each qubit's 2×2 reduced density matrix.
For local `ρ01`, Bloch components are `x=2 Re(ρ01)`, `y=-2 Im(ρ01)`, and
`z=ρ00−ρ11`. The existing Bloch view derives purity **Tr(ρ²)** from that matrix,
not probabilities; no redundant purity field changes the API. Bell/GHZ qubits
are correctly maximally mixed (`ρ=I/2`, zero Bloch vector, purity 0.5) even though
the complete state is pure. Partly entangled states retain intermediate purity.

Native global phase and floating-point residuals are retained. No rounding,
clipping, state renormalization or per-snapshot rephasing is performed. State
norms, matrix Hermiticity, positivity and trace one are checked at absolute
`1e-12`. Physical parity uses projectors/fidelity, not raw amplitude equality.
“Exact ideal” means derived from a double-precision analytic state, not symbolic
arithmetic and not a histogram estimate.

Sampling uses the selected framework's real finite-shot measurement. Counts
include every basis key, including zeros, and sum to the requested shot count.
A supplied unsigned 32-bit seed repeats counts within the same pinned framework
and configuration. An omitted/null seed generates and reports an effective seed
that can be replayed. PennyLane uses NumPy's device RNG; Aer uses its own RNG,
so equal seeds do **not** imply identical histograms across frameworks/releases.
Ideal states/probabilities and traces do not depend on shots or sampling seed.

Observed Bell example, 1,024 shots and seed 42: Aer produced `00:526, 11:498`,
PennyLane `00:515, 11:509`; both produced ideal probabilities 0.5/0.5 within
floating-point tolerance. These are observed counts, not contractual constants.

## UI and educational preservation

The compact selector is above the Lab workspace, with a short explanation that
both choices simulate the same circuit locally. Switching preserves gates, IDs,
angles, qubits, shots, seed, templates and unapplied Code Mode drafts. Selection
is undoable and saved in the existing tab-session draft. Loading a template
retains the chosen simulator. Code examples remain a supported OpenQASM subset
and read-only Qiskit reference, not arbitrary Python execution.

Simulation results from a different circuit/backend are visibly stale and retain
their actual engine label. Old trace/Bloch data is hidden when stale. Backend
changes abort in-flight requests; controller identity checks reject late replies,
and API validators reject mismatched backend metadata. The focused React review
kept cancellation keyed to backend changes while preserving the editor's existing
gate-edit/result history behavior. No automatic dual runs or comparison dashboard
were added: students compare real executions by switching and rerunning.

All 12 promised Deutsch–Jozsa configurations and all 30 supported Grover
configurations run through either selected adapter. Oracle mathematics, the
diffuser's native overall minus sign, iteration limits and interpretation remain
unchanged. All eight Challenges retain authoritative **Qiskit** grading, even
when the Lab run uses PennyLane. Lesson completion rules, session-local progress
and Tutor grounding/proposals are untouched; live AI remains disabled in tests.

## Verification evidence

Baseline at `a5eed03`: **1,020 backend tests**, **161 browser tests**, `pip check`,
TypeScript and production build passed before implementation. The sandbox could
not bind the test server; authorized local server/Chromium execution succeeded.

The 597 new engine tests cover empty identity circuits, all gates and operand permutations on basis and
coherent states, multi-qubit truth tables, parameterized rotations, global-phase
equivalence, Bell/GHZ, nontrivial mixed reduced states, Bloch-Y signs, every trace
step, resource boundaries, seeds, concurrent independent devices and every
algorithm configuration. The 165 new API tests cover both response variants,
default behavior, invalid backend/parameters, validation before execution,
resource limits, missing installation, failed device/numerical/count outputs,
sanitized error responses and unchanged grading for every challenge.

Measured maxima over **24 seeded mixed 64-gate circuits** (1,536 gates and 1,560
snapshots including step zero), using real Qiskit and PennyLane executions:

| Compared quantity | Largest absolute difference |
| --- | --- |
| Full-state projector (global-phase invariant) | 1.2212490298326158 × 10⁻¹⁵ |
| Ideal probability | 1.2212453270876722 × 10⁻¹⁵ |
| Reduced density-matrix entry | 1.5543122344752192 × 10⁻¹⁵ |
| Bloch component | 1.5543122344752192 × 10⁻¹⁵ |
| Native complex amplitude (diagnostic, not physical equality criterion) | 1.0007415106216803 × 10⁻¹⁵ |

All are below the absolute `1e-12` tolerance, with relative tolerance disabled
in the new parity assertions. Independent basis-index contractions and Pauli
expectation calculations check reduced-state physics as well as engine parity.

Final regression results:

| Check | Baseline | Final |
| --- | --- | --- |
| Full backend `pytest -q` | 1,020 passed | **1,782 passed** |
| `pip check` | Clean | **No broken requirements found** |
| TypeScript `npm run typecheck` | Passed | **Passed** |
| Production `npm run build` | Passed | **Passed** |
| Full Chromium `npm run test:e2e` | 161 passed | **181 passed** |
| `git diff --check` | Clean tree | **Passed** |

The final backend total includes 1,020 existing tests, 597 new engine tests and
165 new API tests. The final browser total includes all 161 existing tests and
20 new simulator scenarios, with no failures or skipped scenarios. Expected
outage/error tests deliberately produce proxy/provider errors; these are tested
failure paths, not unexpected walkthrough console errors. No live AI calls occur.

The first full browser regression pass caught the changed Qiskit loading-button
label (180 passed, one failed); preserving the original label fixed it, and the
subsequent **complete** suite passed. Existing browser assertions were not weakened.

### Actual browser walkthroughs

The connected in-app browser and standalone `agent-browser` CLI were unavailable.
The repository's installed **real Chromium/Playwright** harness was used instead,
with owned local Vite/FastAPI servers, real API calls, console-error collection,
interactive controls, JSON attachments and screenshots. These are scripted
browser walkthroughs, not an interactive human/manual browser session.

The added simulator suite includes these journeys at **1440px and 390px**:

| Circuit | Observed result on both simulators |
| --- | --- |
| H on q0, one qubit | 50% / 50%, +X Bloch direction, purity 1 |
| H q0 → CX q0→q1 | 50% `00` / 50% `11`, both reduced states maximally mixed, purity 0.5 |
| RY(π/2) q0 | 50% / 50%, correct positive real amplitudes and +X Bloch direction, purity 1 |
| X q0 → X q1 → CCX q0,q1→q2 | `111` with ideal probability 1; all 1,024 shots `111` |
| Switch Qiskit → PennyLane → Qiskit | Same circuit IDs, gates and settings restored; correct engine metadata and physical parity |

A separate **320px** visual/keyboard journey prepares X q0 (`01`) then SWAP
q0/q1 (`10`) in PennyLane and verifies all 1,024 counts at `10`. The suite also
checks delayed real simulation/trace responses in both switching directions,
wrong-backend replies, forged metadata, pending code, Undo/Redo, templates,
navigation/reload, both algorithms and Qiskit-authoritative challenge grading.

Screenshots and real-execution JSON attachments are emitted under the ignored
`frontend/test-results/` directory by `frontend/e2e/simulators.spec.ts`. Results
and trace captures are taken at scroll top to avoid full-page screenshot
artifacts from the existing mobile sticky toolbar. No external upload is used.

The desktop H/Bell/rotation/CCX captures and mobile Bell/rotation/CCX/SWAP captures
were visually inspected: the selector and actual engine labels are readable,
probabilities are correct, and mixed/pure Bloch states are displayed correctly.
The walkthroughs detected no page/console errors or horizontal page overflow.
Browser verification removed an obsolete disabled Qiskit-only selector and
restored the original Qiskit loading-button label to preserve existing behavior.

### Reproduce verification

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
.venv/bin/python -m pytest -q -s tests/test_pennylane_parity.py -k mixed
```

From `frontend/`, separately:

```sh
npm run typecheck
npm run build
npm run test:e2e
# Focused rerun, when no other suite owns ports 5174/8001:
npm run test:e2e -- e2e/simulators.spec.ts
```

The test harness owns and shuts down its test servers. Do not run browser suites
concurrently on these ports or terminate unrelated development servers.

## Remaining limitations and integration handoff

- Both engines are ideal, local statevector simulators: 1–3 qubits, 256 gates,
  1–8,192 shots, at most 257 trace snapshots. No hardware, noise channels,
  mid-circuit measurements, resets, conditional operations or custom gates.
- Exact numerical outputs are double precision. Histograms/RNG sequences and
  native residuals need not be identical across frameworks, releases or platforms.
- No speed ranking or comparative benchmark is claimed; existing execution time
  metadata reports actual calls only. PennyLane import/startup is lazy.
- Live AI, authentication, database persistence, paid services, QAOA/VQE, public
  deployment and a third simulator are out of scope. Tutor behavior is unchanged.
- Existing local operational limits remain: no global queue, rate limiter, hard
  job timeout or aggregate request/body limit. This is not hardened for public
  exposure. Progress and drafts remain tab-session-local.

After verification, only the integration lead's review and separately authorized
integration remain. This task must not commit, push, merge or deploy the changes.

## Official sources consulted

- [Installation](https://docs.pennylane.ai/en/stable/development/guide/installation.html)
- [default.qubit](https://docs.pennylane.ai/en/stable/code/api/pennylane.devices.default_qubit.DefaultQubit.html)
- [State measurement ordering](https://docs.pennylane.ai/en/stable/code/api/pennylane.state.html)
- [Snapshots](https://docs.pennylane.ai/en/stable/code/api/pennylane.snapshots.html)

Installed distribution metadata and the existing environment's dependency
constraints were checked alongside documentation before choosing the version.
