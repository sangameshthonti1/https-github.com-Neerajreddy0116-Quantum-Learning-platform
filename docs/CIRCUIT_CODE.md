# Expanded quantum engine and Circuit Lab Code Mode

This milestone is local only. It adds declarative circuit editing, not a Python
runtime, Algorithm Explorer, QAOA, VQE, hardware execution, or live AI setup.

## Compatibility and engine

Verified installed versions: Python 3.13.7, Qiskit 2.5.2, Qiskit Aer 0.17.2,
Pydantic 2.13.5, React 19.2.8, TypeScript 7.0.2, Vite 8.2.2 and Playwright 1.63.0.
No dependency was added or upgraded. Official references were reviewed alongside
the installed Qiskit gate docstrings (online versioned 2.5 pages were unavailable):

- [OpenQASM standard gate library](https://openqasm.com/language/standard_library.html)
- [OpenQASM language](https://openqasm.com/language/)
- [Qiskit RZGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.RZGate)
- [Qiskit PhaseGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.PhaseGate)
- [AerSimulator](https://qiskit.github.io/qiskit-aer/stubs/qiskit_aer.AerSimulator.html)

The existing `SimulationRequest` remains canonical for simulation, tracing,
grading, tutor facts and code application. H/X/Z/CX objects, IDs, controls,
targets, request defaults and response fields retain their meanings. Old valid
session drafts need no migration and keep their `v1` storage keys. Invalid drafts
are rejected rather than partially repaired.

| Canonical type | Controls | Targets | Parameters |
| --- | --- | --- | --- |
| `h`, `x`, `y`, `z`, `s`, `sdg`, `t`, `tdg` | `[]` | `[target]` | Field absent |
| `rx`, `ry`, `rz`, `p` | `[]` | `[target]` | `params: [angle]`, required |
| `cx`, `cz` | `[control]` | `[target]` | Field absent |
| `swap` | `[]` | `[first, second]` | Field absent |
| `ccx` | `[firstControl, secondControl]` | `[target]` | Field absent |

`sdg` and `tdg` mean S† and T†. Angles are finite JSON numbers in **radians**;
booleans, strings, null, NaN, Infinity, missing angles, and extra parameters are
invalid. `params` on a fixed gate is rejected, including `params: []`. The one
parameter representation is `params: [angle]`; `angle`/`theta` fields are not
aliases. Every control and target in a gate must be distinct, with in-range
integer indices. IDs are still unique nonblank strings of at most 64 characters.
Limits remain 1–3 qubits, 0–256 gates, 1–8192 shots, and a 32-bit unsigned seed.

`quantum_gates.py` is the explicit native-Qiskit operation allowlist shared by
Aer and `Statevector.evolve`. Both pass qubits in `controls + targets` order.
No approximate application matrices or special-case state tables are used.
The simulator saves the state before implicit terminal measurements of all
qubits. The trace evolves each input gate without optimizing away steps.
Outcome labels retain `q[n-1]...q[0]` ordering: q0 is the rightmost bit.

## Phase and rotation semantics

With amplitudes in local `|0⟩, |1⟩` order:

- Y maps `|0⟩ → i|1⟩` and `|1⟩ → −i|0⟩`.
- S/SDG multiply the `|1⟩` amplitude by `i`/`−i`.
- T/TDG multiply it by `exp(±iπ/4)`.
- `RX(θ) = cos(θ/2) I − i sin(θ/2) X`, likewise RY with Y.
- `RZ(θ) = diag(exp(−iθ/2), exp(iθ/2))`.
- `P(θ) = diag(1, exp(iθ)) = exp(iθ/2) RZ(θ)`.
- CZ negates the component with both operand bits set. SWAP exchanges operand
  states and their correlations. CCX flips the target only when both controls
  are 1, coherently on every basis component; it does not measure the controls.

Global phase multiplies all amplitudes by one unit complex number and cannot
change observations. Relative phase changes one component compared with another
and can change later interference. RZ and P have different native amplitudes,
even when they prepare globally equivalent states. We do not reduce angles
modulo 2π: RX/RY/RZ at 2π equal −I, while P at 2π equals I. Small floating-point
residuals are preserved; use tolerances for numerical comparisons.

Optional RZZ is deferred. It is not in the OpenQASM 3 standard gate library.
Automatically decomposing it as CX–RZ–CX would expand gate counts and trace
steps, and make a 256-gate visual circuit fail the unchanged parser gate limit.
A future milestone should define that decomposition/identity policy explicitly.
`rzz` is rejected in both circuit JSON and this code subset.

## Supported OpenQASM 3 subset

Example:

```qasm
OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
h q[0];
cx q[0], q[1];
rz(pi/2) q[1];
```

This is an explicit subset, not a full OpenQASM implementation. The required
`stdgates.inc` line is a fixed built-in library declaration: the parser does not
read a file, resolve an include path, or load network content. All other includes
are rejected. The program declares exactly one register named `q`. All operands
are individually indexed; no broadcasting or register expressions.

Supported grammar (whitespace and `//` line comments may separate tokens):

```ebnf
program    = "OPENQASM", ("3" | "3.0"), ";",
             "include", '"stdgates.inc"', ";",
             "qubit", "[", count, "]", "q", ";", { operation } ;
count      = "1" | "2" | "3" ;
operation  = fixed1, operand, ";"
           | rotation, "(", expression, ")", operand, ";"
           | ("cx" | "cz" | "swap"), operand, ",", operand, ";"
           | "ccx", operand, ",", operand, ",", operand, ";" ;
fixed1     = "h" | "x" | "y" | "z" | "s" | "sdg" | "t" | "tdg" ;
rotation   = "rx" | "ry" | "rz" | "p" ;
operand    = "q", "[", index, "]" ;
index      = "0" | "1" | "2" ;  (* also less than count *)
expression = term, { ("+" | "-"), term } ;
term       = unary, { ("*" | "/"), unary } ;
unary      = ("+" | "-"), unary | number | "pi" | "(", expression, ")" ;
number     = (digits, [".", [digits]] | ".", digits),
             [("e" | "E"), ["+" | "-"], digits] ;
```

Arithmetic uses binary64 floats, normal precedence, and left associativity for
binary operations. Angles and intermediate values must be finite. Division by
zero is an error. Numeric serialization preserves binary64 values and uses exact
recognized presets like `pi/2`, never approximate rounding of nearby values.
Source comments/formatting are not retained after Apply; semantics are.

Resource bounds are checked before simulation is possible:

| Resource | Limit |
| --- | --- |
| Source, including comments/whitespace | 32,768 characters |
| Non-comment lexical tokens | 16,384 |
| Statements | 259 (three declarations + 256 gates) |
| Angle expression tokens | 64 per angle |
| Recursive expression depth | 16 |
| HTTP request body (including JSON escaping) | 200,000 bytes |
| HTTP request body arrival time | 5 seconds |

Errors identify the first rejected token with 1-based line/column coordinates
(LF and CRLF source). Unsupported tokens are never skipped. Rejected constructs
include block comments, symbols other than `pi`, functions, exponent operators,
gate modifiers, custom gates, extra registers, classical data, conditions, loops,
reset, barriers, explicit measurement and arbitrary Python/shell code. The lexer
uses an anchored allowlist and the expression parser interprets only numeric
arithmetic. There is no `eval`, `exec`, import resolution, filesystem or network
access in parsing. HTTP request validation and parsing run through FastAPI's
existing error boundary and worker pool.

## Conversion API

`POST /api/circuits/parse` accepts:

```json
{
  "source": "OPENQASM 3.0; include \"stdgates.inc\"; qubit[1] q; ry(pi/2) q[0];",
  "shots": 1024,
  "seedSimulator": 42
}
```

`source` is a required string. Shots default to 1024; seed defaults to null.
Settings use the same strict bounds as simulation. Unknown request fields are
rejected. HTTP 200 is `{ "circuit": <validated SimulationRequest> }`. Code errors
return HTTP 422, with no circuit or partial result:

```json
{
  "diagnostics": [
    { "line": 4, "column": 6, "message": "An angle cannot contain division by zero.", "code": "invalid_angle" }
  ]
}
```

Oversize and slow bodies return HTTP 413/408 with diagnostics. Malformed JSON or invalid envelope fields use the existing `detail` validation
format documented in [API_CONTRACT.md](API_CONTRACT.md). The endpoint never
invokes Aer, tracing, Python, or an execution shell. Frontend serialization is
pure and local in `circuitCode.ts`; no conversion endpoint is needed to generate
code from an already validated visual circuit.

## Editor workflow and identity

Visual, Code, and State Explorer share one Circuit Lab, canvas, canonical state,
simulator, and history. Code Mode removes the gate sidebar to give code and the
canvas room; simulation results remain available. The native textarea has an
accessible label, diagnostic links, browser text editing, visible focus, and no
Tab key trap. Templates write only to the draft, never directly to the circuit.

- Clean code follows the applied visual circuit, including Undo/Redo.
- Typing creates a separate draft. Validate reports syntax/semantics without
  applying. Apply validates and replaces the circuit in one existing history
  transaction; existing shots/seed/backend settings are retained.
- Invalid code leaves the circuit, history, and result identity intact. Discard
  restores generated code from the currently applied circuit.
- A visual edit or Undo while code is pending retains the draft and shows a
  conflict message. Replacement requires the explicitly labeled **Replace
  circuit with draft** action.
- Every source/circuit revision and unmount cancels obsolete parser requests.
  A late parser response cannot replace a newer applied circuit. In-flight
  trace requests are likewise cancelled on circuit changes. Simulation retains
  the existing snapshot policy: a pending run belongs to its submitted request
  and is marked stale if the editor changes. It never writes circuit state or
  presents old results as current.
- Pending code drafts are separately versioned in session storage per workspace,
  with an in-memory fallback for client navigation when storage is blocked.
  Applied drafts and the last 100 edits retain existing in-memory navigation
  history. Reload restores applied and pending drafts, not the Undo stack or
  simulation results. No migration or persistent database is introduced.

Oversize code insertion is rejected with a message while retaining the previous
source; the editor never silently truncates a pasted program to a runnable prefix.

Gate IDs are not OpenQASM syntax. On application, matching operations reuse old
IDs in occurrence order; new operations get new UUIDs. Comparison includes gate
type, ordered controls/targets, and parameters. A formatting-only round trip
causes no circuit/history change. Duplicate operations remain distinct; deleted
or edited operations need not retain their former ID. Serializing and parsing
preserves ordered operation semantics and numeric values for all valid circuits,
including the 256-gate boundary. No circuit optimization or gate folding occurs.

The generated Qiskit Python example uses the applied circuit and fixed supported
Qiskit methods. It shows `Statevector.from_instruction` before measurement.
It is read only and is **never executed by the application**. Arbitrary Python
editing or execution is not supported.

## Regression protections and validation

The challenge catalog and all existing allowed-gate lists are unchanged. Backend
grading checks allowed gates before awarding credit, even if a new gate prepares
the right target. Preparation comparisons now include parameters. Lesson
evidence still requires each original prescribed circuit and verified results.
Tutor facts can explain expanded gates with radians and complex amplitudes;
Tutor v1 circuit suggestions retain their existing H/X/Z/CX-only output schema.
Live AI remains disabled unless the user separately configures a provider.

New backend tests compare real simulation and every trace step with independent
matrices/basis permutations, including native phases, inverse relationships,
all CCX input basis states and operand permutations, SWAP/CZ wire ordering,
probability/normalization sums, reduced density matrices and Bloch vectors.
Parser tests cover accepted grammar, malicious/unsupported constructs, numerical
and resource limits, diagnostics and separation from execution.

Browser tests exercise real local parsing, Aer and tracing for H, Bell, RY(π/2),
and CCX on desktop/mobile. They cover invalid edits, diagnostic keyboard access,
parameter placement/editing, ID-preserving round trips, Undo/Redo, stale results,
draft persistence, conflicts and late responses. They also run every gate through
the TypeScript serializer and real canonical parser. Existing browser suites
remain in place; nothing uses mocked quantum results to claim correctness.

Run from the repository:

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
cd ../frontend
npm run typecheck
npm run build
npm run test:e2e
```

The browser suite owns ports 8001 and 5174 and leaves developer servers alone.
It requires local loopback binding and an installed Chromium browser. The
milestone and its verification do not commit, push, publish, or deploy code.
