# Expanded Quantum Engine + Code Mode — local review

Review URL: **http://127.0.0.1:5180/lab?workspace=free**

The preview uses a dedicated FastAPI process on `127.0.0.1:8010`, with live AI
explicitly disabled. Existing developer servers were left untouched. The branch
remains `prebuild/expanded-engine`; the tree was clean before this work. No
branch switch, reset, commit, push, publication or deployment was performed.

## Delivered

The 16 native gates are **H, X, Y, Z, S, S†, T, T†, RX, RY, RZ, P, CX, CZ,
SWAP and CCX**. Canonical names use lowercase, `sdg`, and `tdg`. The shared
execution allowlist supplies real Qiskit operations to Aer and state tracing.
Parameters are `params: [angle]` in radians on RX/RY/RZ/P only. SWAP has two
targets; CCX has two controls and one target. Existing gate objects, bit order,
shots, statevector stages and response fields remain compatible. Limits remain
1–3 qubits, 256 gates, and 8192 shots. No draft migration or dependency change
was required. RZZ is deferred for the standard-language/round-trip reason in
[the complete contract](CIRCUIT_CODE.md).

Code Mode shares Circuit Lab's canvas, simulator and Undo/Redo state. It provides
generated OpenQASM, explicit Validate/Apply, error locations, safe discard,
pending-draft persistence, ID reuse, conflict handling and protection from late
parser responses. Circuit and angle edits invalidate result identity. The grouped
palette includes descriptions and radian presets; CCX placement asks for two
controls before its target. The React review informed the pending-draft fallback
when browser storage is blocked and explicit request cancellation on revisions.

The language is a strict **OpenQASM 3 subset**, with a version statement, fixed
`stdgates.inc` declaration, one `qubit[1..3] q` register, and ordered gate
statements. Angle expressions support decimal/scientific numbers, `pi`, unary
signs, arithmetic `+ - * /`, and parentheses. See the
[exact grammar, safety bounds and conversion API](CIRCUIT_CODE.md#supported-openqasm-3-subset).
There are no external includes, functions, loops, classical operations,
explicit measurements or Python execution. Unsupported input is rejected in
full. Oversize insertions do not silently truncate a program.

The Qiskit Python example is generated from the applied circuit and is read
only. **Arbitrary Python editing or execution is not supported.**

## Verification

- Backend: **891 tests passed**, including simulation, tracing, challenge
  grading, configuration/CORS, Tutor v1 and provider-boundary regressions.
- `pip check`: no broken requirements.
- TypeScript and production build: passed with the installed versions.
- Browser suite: **137 tests passed** in the complete run (118 existing tests
  and 19 new engine/code-mode tests).
- Dedicated real preview walkthrough: passed for all five requested cases;
  no unexpected browser errors or framework overlays. Open details were checked
  for page overflow at 320, 390 and 768 pixels. Screenshots were inspected.

The two existing backend tests that enumerated the old supported set were
updated to describe the expanded contract; their unsupported-input and OpenAPI
assertions remain. All other existing backend and browser tests were retained.
Existing lesson evidence still requires the original prescribed circuits, and
new gates cannot bypass challenge-specific allowed-gate constraints. A separate
test proves that RY(π) reaches the flip target but earns zero challenge credit
because that gate is disallowed. The four lessons and eight challenges were not
rewritten. Tutor facts include angles and complex amplitudes; v1 suggestions
retain their original H/X/Z/CX-only schema. No live provider call was made.

## Observed real examples

All runs use Qiskit **2.5.2**, Aer **0.17.2**, 1024 shots and seed 42. The
values below are rounded for reading; saved evidence contains raw precision,
request snapshots, sampled counts and every trace step.

| Circuit | Observed ideal outcome | Canvas / code result |
| --- | --- | --- |
| One qubit, visual H | amplitudes `(1/√2, 1/√2)`; probabilities 0.5/0.5 | H shown on q0; generated `h q[0];` |
| Code Bell: H q0, CX q0→q1 | probabilities 00=0.5, 11=0.5; others 0 | Connected H/CX canvas; same request sent to Aer |
| Code RY(π/2) q0 | real amplitudes `(1/√2, 1/√2)` | Rotation angle echoed in canvas, code and trace |
| X q0, X q1, CCX(q0,q1→q2) | probability 111=1; 1024 counts at 111 | Two controls and target on three wires |
| Append invalid `rx(pi/0) q[0];` | HTTP 422, line 13 column 6, division-by-zero diagnostic | Previous three-qubit circuit preserved |

Raw walkthrough evidence is at
`/private/tmp/qlp-expanded-review/verified-examples.json`; screenshots are in the
same directory. Reproduce against a running local preview with:

```sh
cd frontend
PLAYWRIGHT_BROWSERS_PATH=0 node scripts/expanded-walkthrough.mjs http://127.0.0.1:5180 /private/tmp/qlp-expanded-review
```

The browser-verification CLI was unavailable; the existing
Playwright/Chromium installation supplied the real browser checks without adding
a dependency. The deliberately rejected invalid-code request produces an
expected HTTP 422 browser resource log, recorded separately from unexpected
browser errors. Existing outage tests similarly create intentional proxy errors.

## Changed-file inventory

Paths are relative to the repository. “New” files are untracked for local review;
nothing has been staged or committed.

| Area | Files |
| --- | --- |
| Canonical schema and gate execution | `backend/app/schemas/simulation.py`; new `backend/app/services/quantum_gates.py`; `backend/app/services/qiskit_simulator.py`; `backend/app/services/qiskit_trace.py` |
| Parser and API | new `backend/app/schemas/circuit_code.py`, `backend/app/services/circuit_code.py`, `backend/app/api/routes/circuit_code.py`; `backend/app/api/router.py` |
| Grading and Tutor compatibility | `backend/app/services/challenges.py`; `backend/app/services/tutor_context.py`; `backend/app/services/tutor_provider.py`; `backend/app/api/routes/tutor.py` |
| Backend tests | new `backend/tests/test_expanded_gates.py`, `backend/tests/test_circuit_code.py`; `backend/tests/test_simulation.py`; `backend/tests/test_simulation_execution.py` |
| Frontend contracts and code conversion | `frontend/src/api/types.ts`; `frontend/src/api/traceClient.ts`; new `frontend/src/api/codeClient.ts`, `frontend/src/lab/gates.ts`, `frontend/src/lab/circuitCode.ts` |
| Circuit Lab integration | `frontend/src/lab/CircuitLab.tsx`; `frontend/src/lab/CircuitCanvas.tsx`; `frontend/src/lab/GatePanel.tsx`; `frontend/src/lab/StateExplorer.tsx`; `frontend/src/lab/useCircuitEditor.ts`; `frontend/src/lab/lab.css`; new `frontend/src/lab/CodeMode.tsx`, `frontend/src/lab/AngleField.tsx` |
| Browser verification | new `frontend/e2e/code-mode.spec.ts`, `frontend/scripts/expanded-walkthrough.mjs` |
| Documentation | `backend/README.md`; `frontend/README.md`; `docs/API_CONTRACT.md`; new `docs/CIRCUIT_CODE.md`, `docs/EXPANDED_ENGINE_REPORT.md` |

## Limits and handoff

Full OpenQASM, RZZ, Algorithm Explorer, QAOA, VQE, arbitrary Python and hardware
execution remain outside this milestone. Formatting/comments are regenerated on
Apply; ordered circuit semantics and binary64 angle values are preserved.
Reload restores drafts but not the Undo stack or simulator snapshots. The
service remains local and unauthenticated. The preview's session data is scoped
to its origin and browser tab, so drafts on another port are not automatically
copied or overwritten.

The website is left running for inspection. The source remains local and
uncommitted on the requested branch.
