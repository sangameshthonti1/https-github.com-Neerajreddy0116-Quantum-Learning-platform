# Quantum Learning API contract — simulation and state tracing

This document defines the local HTTP boundary independently of Qiskit Python
objects. The running API also publishes its schema at `GET /openapi.json` and
interactive documentation at `/docs`. API keys are not required for this local
milestone. Do not expose this unauthenticated service to the public internet.

## Existing endpoints

- `GET /api/health`: HTTP 200, exactly
  `{"status":"ok","service":"quantum-learning-api"}`. Process liveness only.
- `GET /`: HTTP 307 redirect to `/docs`.
- `GET /docs` and `GET /openapi.json`: HTTP 200.

## POST /api/circuits/parse

Validates a bounded OpenQASM 3 subset and returns a canonical circuit without
executing it. Request/response/error envelopes, exact grammar, resource bounds,
and bidirectional-editor behavior are documented in
[CIRCUIT_CODE.md](CIRCUIT_CODE.md#conversion-api). Existing simulation and trace
endpoints continue to accept only circuit JSON.

## POST /api/simulate

Send `Content-Type: application/json`. Runs an ideal, noiseless local CPU
simulation. The request is declarative data, never Python, QASM, or executable
code. Gates execute in array order. Every qubit starts in `|0⟩`.

### Request

```json
{
  "numQubits": 2,
  "gates": [
    {"id": "g1", "type": "h", "targets": [0], "controls": []},
    {"id": "g2", "type": "cx", "targets": [1], "controls": [0]}
  ],
  "shots": 1024,
  "backend": "qiskit",
  "seedSimulator": 42
}
```

| Field | Required | Contract |
| --- | --- | --- |
| `numQubits` | Yes | Integer, 1–3 inclusive |
| `gates` | Yes | Array of 0–256 gate objects; `[]` is the identity circuit |
| `shots` | Yes | Integer, 1–8192 inclusive |
| `backend` | No | `"qiskit"` (default) selects local Qiskit Aer; `"pennylane"` selects independent PennyLane `default.qubit` |
| `seedSimulator` | No | Integer, 0–4294967295 inclusive, or `null` |

When the seed is absent or null, the server chooses a seed and returns the
actual value in metadata. Replaying it reproduces sampled counts for the same
circuit, shot count, pinned engine versions, and simulator configuration.
Reproducibility across different library releases/platforms is not guaranteed.
The seed affects sampling, not ideal probabilities.
The two frameworks use different random samplers, so the same seed does not
promise the same counts across backends. Trace data is independent of the seed.

Qubit indices/counts, shots and seeds require actual JSON integers: strings, booleans,
and floating-point values (including `1.0`) are rejected. Unknown fields are
rejected, not silently ignored. Field names use the camelCase spelling above.

### Gate objects

The four base fields are required on every gate; `params` is conditional:

| Field | Contract |
| --- | --- |
| `id` | String of 1–64 characters containing a non-whitespace character; unique within the request |
| `type` | Lowercase `h`, `x`, `y`, `z`, `s`, `sdg`, `t`, `tdg`, `rx`, `ry`, `rz`, `p`, `cx`, `cz`, `swap`, or `ccx` |
| `targets` | Exactly one index except SWAP, which has two ordered target indices |
| `controls` | One index for CX/CZ, two for CCX, empty for all other gates |
| `params` | Required only for RX/RY/RZ/P: exactly one finite JSON number in radians; forbidden on fixed gates |

Indices must be integers in `0..numQubits-1`. Duplicate entries are invalid. Controls
and targets must be disjoint. `cx` means control `controls[0]`, target
`targets[0]`, with the X action conditioned on the control being 1.

Angles accept integer or floating-point JSON numbers, never strings, booleans,
null or nonfinite values. Native global phase is preserved. P(θ) equals
exp(iθ/2) RZ(θ); this factor changes all amplitudes equally and has no observable
effect. Angles are not normalized modulo 2π. Old gate objects are unchanged and
have no `params` field, including when echoed by tracing.

Reset, measurement instructions, barriers,
classical conditions, initial-state overrides, noise models, and backend names
other than `qiskit` / `pennylane` are **not supported**. They produce validation errors. The gate
schema uses a tagged union by `type`, including explicit parameterized variants.
RZZ is deferred and rejected. The backend identifier
and backend-independent response similarly allow deliberate future adapters;
there is no fallback to a different simulator.

### Measurement semantics

This milestone supports **implicit terminal measurement of all qubits only**:

1. Apply the validated unitary gate list to `|0...0⟩`.
2. Save the full statevector **before any measurement** in Aer.
3. Append computational-basis measurements `q[i] → c[i]` for every qubit.
4. Run Aer with the requested shot count and seed to obtain sampled counts.

Those are the preserved Qiskit execution steps. PennyLane constructs the same
validated operations on `default.qubit`, executes an analytic QNode returning
`qml.state()`, then executes a separate finite-shot QNode with
`qml.counts(wires=[n-1, ..., 0], all_outcomes=True)` and the effective seed.
Both executions prepare the same circuit from all zeros. The application does
not synthesize counts using its own random sampler.

The returned statevector and ideal probabilities describe step 2, not a
collapsed post-measurement trajectory and not the post-measurement ensemble.
Ideal probabilities are calculated as `real² + imag²` from each saved amplitude;
counts are obtained from actual selected-framework execution, not generated by application
code or used to estimate the ideal probabilities.

Explicit measurement gates are always rejected, even at the end. Mid-circuit
measurements and classical feed-forward cannot therefore be silently discarded
or incorrectly represented by a pure statevector.

### Bit ordering

Qubit 0 is the least-significant bit. Binary labels are full-width strings in
`q[n-1]...q[0]` order. Qiskit measurements use one classical register with `q[i] → c[i]`.
There are no spaces, prefixes, or omitted leading zeros in labels.

PennyLane device wires are explicitly ordered `[n-1, ..., 0]`. Gate operations
use unchanged logical wire labels, with controls before targets. This maps
PennyLane's first tensor axis to q[n-1] and its last axis to q0. State and counts
use this same order; reduced-state indices map q to tensor position `n-1-q`.

- For 2 qubits, X on q0 gives `"01"`; X on q1 gives `"10"`.
- For 3 qubits, X on q2 gives `"100"`.
- `statevector[i]` is the amplitude of the basis state whose binary label is
  `i` padded to `numQubits` bits.
- Thus for 2 qubits the statevector order is `00, 01, 10, 11`.

Both probability and count dictionaries contain **all `2^numQubits` labels**,
including zeros. JSON dictionary ordering is not significant. Statevector array
ordering is significant and follows the convention above.

### HTTP 200 response schema

| Field | JSON type | Meaning |
| --- | --- | --- |
| `backend` | string | Actual selected engine: `"qiskit"` or `"pennylane"` |
| `numQubits` | integer | Requested number of qubits |
| `probabilities` | object: binary string → number | Ideal pre-measurement probabilities for every basis state |
| `counts` | object: binary string → integer | Actual sampled counts, zero-filled for unobserved states; sums to `shots` |
| `statevector` | array of `{ "real": number, "imag": number }` | `2^numQubits` pre-measurement complex amplitudes |
| `shots` | integer | Number of shots actually requested and verified in the count total |
| `metadata` | object | Execution details below |

Common metadata fields (required for both engines), plus engine-specific versions:

| Field | JSON type/value | Meaning |
| --- | --- | --- |
| `method` | `"statevector"` | Exact statevector method, double precision, CPU, no noise model |
| `measurement` | `"terminal-all"` | Implicit terminal measurement of every qubit |
| `statevectorStage` | `"before-measurement"` | Point at which the state was saved |
| `bitOrder` | `"q[n-1]...q[0]"` | Binary label convention |
| `seedSimulator` | integer | Effective sampling seed (also the transpiler seed for Qiskit) |
| `gateCount` | nonnegative integer | Number of input gates; excludes save/measurement instructions |
| `circuitDepth` | nonnegative integer | Input circuit depth before save, measurement, or transpilation; disjoint gates may share a layer |
| `executionTimeMs` | nonnegative number | Wall time for construction, compilation, execution, and result extraction; excludes HTTP queuing/serialization |
| `qiskitVersion` | string | Required only for Qiskit: actual installed SDK version |
| `aerVersion` | string | Required only for Qiskit: actual installed Aer version |
| `engine` | `"pennylane.default.qubit"` | Required only for PennyLane: actual device implementation |
| `pennylaneVersion` | string | Required only for PennyLane: actual installed PennyLane version |

Engine-specific fields for the other framework are absent, not null or invented.
The existing Qiskit metadata field set is preserved. Backend/metadata identity
must agree. `executionTimeMs` is request bookkeeping, not a benchmark: it excludes
lazy module import, HTTP queuing and response serialization. Do not use it to
claim a framework performance advantage.

All numbers are finite JSON values; there are no Python complex objects,
NumPy scalars, NaN, Infinity, or Qiskit result objects in the public response.
Numerical floating-point residuals are not rounded away. Probability sum and
statevector squared norm equal 1 within floating-point tolerance (use about
`1e-12`, not exact equality). Ideal means state-derived rather than sampled,
not symbolic or arbitrary-precision arithmetic. Sampled counts fluctuate and
need not equal probability multiplied by shots.

For the Bell request above, the ideal probabilities are 0.5 on `00` and `11`,
zero on `01` and `10`, within floating-point tolerance. Amplitudes at indices 0
and 3 are `1/sqrt(2)`, others zero. Both deterministic version information and
variable execution timing are included; timing is not a reproducibility promise.

### HTTP 422 validation errors

Malformed JSON, missing fields, invalid types, unsupported operations/backends,
and circuit constraint violations return:

```json
{
  "detail": [
    {
      "loc": ["body", "shots"],
      "msg": "Input should be greater than or equal to 1",
      "type": "greater_than_equal"
    }
  ]
}
```

Each issue has exactly `loc` (array of field names/array indices), `msg`
(human-readable explanation), and `type` (validation error code). Gate union
locations may include their `type` discriminator. Cross-field errors use
`["body"]` or the gate location and include relevant gate ID/index information
in the message. Raw request bodies and exception objects are not echoed.
Clients should use HTTP status, `type`, and `loc` rather than parsing prose;
message wording may evolve with validation-library versions.

### HTTP 500 execution errors

If local simulation fails, no partial or fabricated result is returned:

```json
{
  "error": {
    "code": "simulation_failed",
    "message": "The simulator could not complete this circuit. Please retry."
  }
}
```

Detailed exceptions are logged locally, not exposed in the HTTP response.
Validation is performed before invoking the simulator.

## POST /api/simulate/trace

Returns the initial state and the state **after every input gate**, in request
array order. Qiskit uses `Statevector.evolve` with native operations for all 16
instructions and `partial_trace` for reduced states. PennyLane uses
`qml.Snapshot` at step zero and after every native operation, collected by
`qml.snapshots` during one `default.qubit` execution. Reduced matrices come from
`qml.math.reduce_statevector` of the actual full state. There is no sampled-count
reconstruction, example-state lookup, circuit optimization, or gate fusion.
The existing `POST /api/simulate` response contract is unchanged. Both execution
paths reuse the same canonical validated gate model and pass controls before targets;
each engine has its own native-operation allowlist.

### Request and measurement semantics

Send the **same `SimulationRequest` JSON** described above. The endpoint reuses
the same model and all of its strict validation: 1–3 qubits, 0–256 gates,
unique IDs, legal/disjoint target and control indices, 1–8192 shots, backend
`"qiskit"` (default) or `"pennylane"`, and the optional seed range. Unsupported gates, explicit measurements
(including terminal measurement instructions), and unknown fields remain errors.

`shots` is still required and validated; `seedSimulator` is still optional and
validated. Neither changes the deterministic ideal trace. No measurements or
sampling are performed by this endpoint, so it returns **no counts**, no shot
total, and no effective random seed. Use `/api/simulate` for sampled terminal
measurements. `measurement: "terminal-all"` describes the shared circuit
measurement convention, while `samplingPerformed: false` makes the trace-only
execution explicit. Every snapshot, including the last, is **before measurement**.

### HTTP 200 response schema

All fields below are present. Public keys use camelCase. Complex values use
the existing `{ "real": number, "imag": number }` representation, including
every entry of a reduced density matrix.

| Field | JSON type | Meaning |
| --- | --- | --- |
| `backend` | `"qiskit"` or `"pennylane"` | Actual selected local engine family |
| `numQubits` | integer | Requested qubit count |
| `basisOrder` | string array | All `2^numQubits` basis labels in ascending integer order |
| `steps` | array of trace steps | Exactly `gates.length + 1` entries, at most 257 |
| `metadata` | object | Trace conventions and execution information below |

Each trace step contains:

| Field | JSON type | Meaning |
| --- | --- | --- |
| `index` | integer | 0 for the initial state, then 1 through `gates.length`; this is not circuit depth |
| `gate` | gate object or `null` | `null` at step 0; otherwise the full `gates[index - 1]` object, including `id`, `type`, `targets`, and `controls` |
| `statevector` | complex-value array | Full pure state of all qubits, indexed by `basisOrder` |
| `probabilities` | object: basis label → number | Dense ideal probabilities `real² + imag²`, including zero-probability labels |
| `qubits` | reduced-state array | Exactly `numQubits` entries, ordered q0, q1, q2 as applicable |

Each reduced-state entry contains:

| Field | JSON type | Meaning |
| --- | --- | --- |
| `qubit` | integer | The retained qubit's original request index |
| `densityMatrix` | 2×2 array of complex values | Row-major matrix in local basis `["0", "1"]` |
| `blochVector` | `{ "x": number, "y": number, "z": number }` | Pauli expectation values of the reduced state |

Metadata fields:

| Field | JSON type/value | Meaning |
| --- | --- | --- |
| `engine` | `"qiskit.quantum_info.Statevector"` or `"pennylane.default.qubit"` | Actual evolution implementation; tracing does not sample shots |
| `method` | `"statevector"` | Ideal unitary state evolution |
| `measurement` | `"terminal-all"` | Shared circuit convention, not a measurement taken during tracing |
| `statevectorStage` | `"before-measurement"` | Stage of every returned snapshot |
| `samplingPerformed` | `false` | No shot sampling in this endpoint |
| `bitOrder` | `"q[n-1]...q[0]"` | Qubit 0 is the least-significant bit |
| `reducedBasisOrder` | `["0", "1"]` | Row/column order of each 2×2 matrix |
| `globalPhase` | `"qiskit-native"` or `"pennylane-native"` | Selected framework's native phase retained without independently rephasing snapshots |
| `gateCount` | integer, 0–256 | Number of input gates |
| `stepCount` | integer, 1–257 | Includes the initial state |
| `executionTimeMs` | finite nonnegative number | Evolution and snapshot extraction time; excludes HTTP queuing/serialization |
| `qiskitVersion` | string | Required only for Qiskit: actual installed version |
| `pennylaneVersion` | string | Required only for PennyLane: actual installed version |

### Indexing, reduced states, normalization, and global phase

For every step, `statevector[i]` corresponds to `basisOrder[i]`, namely the
integer `i` padded to `numQubits` binary digits. For two qubits the order is
`00, 01, 10, 11`; X on q0 gives `01`. The order of keys in probability objects
is not significant. Reduced-state array order is ascending **qubit index**, not
the left-to-right order of the characters in a basis label.

For qubit q, the service traces out **all other** qubits from `|ψ⟩⟨ψ|`:
`ρq = Tr(other qubits)(|ψ⟩⟨ψ|)`. With `ρ01` denoting row 0, column 1,
`x = 2 Re(ρ01)`, `y = -2 Im(ρ01)`, and `z = ρ00 - ρ11`.
Equivalently, `ρq = (I + xX + yY + zZ)/2`. A mixed reduced state belongs inside
the Bloch ball; it must not be normalized to a unit-length vector or replaced
with an independent pure qubit. Reduced states alone do not encode entanglement
correlations; the full statevector remains available.

Purity is derived as `Tr(ρq²)`, equal to the sum of squared magnitudes of entries
for these Hermitian matrices, or `(1+x²+y²+z²)/2`. The existing response layout
does not add a redundant purity field; the Bloch view calculates it from the
returned density matrix. It ranges from 0.5 for maximally mixed to 1 for pure.

The engine checks finite values and normalization of each statevector, and
finite, Hermitian, positive-semidefinite, trace-one reduced density matrices,
using absolute tolerance `1e-12`. Response models also reject NaN and Infinity.
Probabilities sum to one and Bloch lengths are at most one within numerical
tolerance. Results retain double-precision residuals, including signed zero;
they are not rounded, clipped, renormalized, or projected onto pure states.
“Exact ideal” means state-derived, not sampled, symbolic, or arbitrary precision.

The initial state's amplitude at index 0 is positive 1. Thereafter, the selected
framework's native gate phases are preserved. States `ψ` and `exp(iφ) ψ` are physically
equivalent even if their raw amplitudes differ. Compare states using their
projectors `|ψ⟩⟨ψ|`, fidelity, or `Statevector.equiv` within tolerance; do not use
elementwise amplitude equality as physical equality. Probabilities, reduced
matrices, and Bloch vectors are invariant under global phase. Relative phase
is preserved: H→Z→H yields `|1⟩`, not `|0⟩`.

### Bell trace example

POST the two-qubit Bell request shown in the simulation section to
`/api/simulate/trace`. The live Qiskit 2.5.2 response used
`a = 0.7071067811865475` and `p = 0.4999999999999999`:

| Step | `gate` | Statevector, basis `00,01,10,11` | Probabilities, same order | q0 Bloch | q1 Bloch |
| --- | --- | --- | --- | --- | --- |
| 0 | `null` | `[1,0,0,0]` | `[1,0,0,0]` | `(0,0,1)` | `(0,0,1)` |
| 1 | `g1`: H on q0 | `[a,a,0,0]` | `[p,p,0,0]` | `(≈1,0,0)` | `(0,0,≈1)` |
| 2 | `g2`: CX q0→q1 | `[a,0,0,a]` | `[p,0,0,p]` | `(0,0,0)` | `(0,0,0)` |

All these amplitudes have zero imaginary part. Step 1's nonzero Bloch components
were `0.9999999999999998`. At step 2, **each** qubit has the following reduced
matrix and Bloch vector (the entry for q1 differs only in `qubit`):

```json
{
  "qubit": 0,
  "densityMatrix": [
    [{"real": 0.4999999999999999, "imag": 0.0}, {"real": 0.0, "imag": 0.0}],
    [{"real": 0.0, "imag": 0.0}, {"real": 0.4999999999999999, "imag": 0.0}]
  ],
  "blochVector": {"x": 0.0, "y": -0.0, "z": 0.0}
}
```

These are maximally mixed reduced qubits (`ρ ≈ I/2`, purity `Tr(ρ²) ≈ 1/2`),
even though the full Bell state is pure. Values above are an observed example,
not a promise of bit-for-bit equality across Qiskit releases or platforms.

### Errors and bounds

HTTP 422 uses the same sanitized validation envelope as `/api/simulate` and
validation completes before state evolution. Engine or numerical failures use
the same HTTP 500 `simulation_failed` envelope. No partial trace is returned on
failure, and private engine details remain in local logs only.

At most 257 snapshots are produced; each has at most 8 complex amplitudes,
8 probabilities, and 3 reduced 2×2 matrices. Evolution proceeds once per gate;
it does not resimulate every prefix or loop over shots. This endpoint adds no
mid-circuit measurements, new gate types, or frontend visualization.

## CORS and local operational limits

`QLP_CORS_ORIGINS` remains an explicit allowlist, empty by default. Only
`/api/simulate` and `/api/simulate/trace` permit POST preflights with `Content-Type`; health/docs retain
GET-only CORS permissions. Credentials and Authorization are not enabled.
CORS is not authentication and does not prevent execution by non-browser clients.

The 3-qubit, 256-gate, and 8192-shot bounds limit individual jobs. Synchronous
simulation handlers run in FastAPI's worker pool, outside the async event loop;
each Aer instance is limited to one parallel execution thread. There is no
job queue, hard job timeout, aggregate request/body limit, or rate limiter for
these ordinary simulation routes. Those protections are required before public exposure.
The separate Task 21 variational namespace has a supervised, bounded job lifecycle,
described below; it does not alter ordinary simulation semantics.

## Official references used

- [Qiskit bit ordering](https://quantum.cloud.ibm.com/docs/en/guides/bit-ordering)
- [AerSimulator API](https://qiskit.github.io/qiskit-aer/stubs/qiskit_aer.AerSimulator.html)
- [SaveStatevector API](https://qiskit.github.io/qiskit-aer/stubs/qiskit_aer.library.SaveStatevector.html)
- [Statevector evolution and phase equivalence](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.quantum_info.Statevector)
- [Qiskit partial trace](https://quantum.cloud.ibm.com/docs/en/api/qiskit/quantum_info#partial_trace)
- [PennyLane installation requirements](https://docs.pennylane.ai/en/stable/development/guide/installation.html)
- [default.qubit device, wire order and seeds](https://docs.pennylane.ai/en/stable/code/api/pennylane.devices.default_qubit.DefaultQubit.html)
- [PennyLane state measurement](https://docs.pennylane.ai/en/stable/code/api/pennylane.state.html)
- [PennyLane snapshots](https://docs.pennylane.ai/en/stable/code/api/pennylane.snapshots.html)

The implementation uses `qiskit.QuantumCircuit`, `qiskit.transpile`,
`qiskit_aer.AerSimulator`, and `qiskit_aer.library.SaveStatevector` with
`simulator.run(...).result()`. It does not use removed `qiskit.execute`,
`qiskit.Aer`, or `qiskit.providers.aer` imports.
## AI Tutor extension

The AI Tutor contract is unchanged by simulator selection. `POST /api/ai/tutor`
adds bounded contextual tutoring with independently computed Qiskit facts and
validated, opt-in circuit proposals. See [AI Tutor contract, errors and limits](AI_TUTOR.md).

## Algorithm Explorer additions

The existing simulation, trace, parser, challenge and Tutor contracts are
backward compatible. `GET /api/algorithms` lists trusted definitions;
`POST /api/algorithms/build` validates selections and returns a canonical circuit;
`POST /api/algorithms/run` returns that definition, the existing simulation and
trace response shapes, and state-derived algorithm interpretation. See the
[algorithm contract, request examples, limits and bit ordering](ALGORITHM_EXPLORER.md#api-additions).

Both algorithm build/run request variants now accept optional
`"backend": "qiskit" | "pennylane"` (default `"qiskit"`). The built canonical
circuit carries that selection, and simulation and tracing use the same selected
adapter. All 12 Deutsch–Jozsa and 30 Grover configurations are supported on both.
Oracle construction, iteration counts and interpretation are unchanged. Challenge
grading and AI Tutor grounding remain on their authoritative Qiskit path.

See [PennyLane implementation and verification](PENNYLANE_BACKEND.md) for
dependency choices, parity evidence, browser checks and remaining limitations.

## Task 21: variational optimization

`GET /api/variational` returns trusted problem definitions and resource limits.
`POST /api/variational/build` returns a bound canonical circuit preview, parameter
ordering, Hamiltonian/graph and exact classical reference without running an optimizer.
`POST /api/variational/jobs/{uuid}` accepts the same request and returns HTTP 202
with a job snapshot. `GET` polls recorded real evaluations; `DELETE` cancels and
waits for subprocess cleanup. The existing `/api/algorithms` catalog/build/run
contract remains Deutsch–Jozsa/Grover-only for backward compatibility; the UI
combines both namespaces in its four-module explorer.

Requests are discriminated by `algorithm: "vqe" | "qaoa"`. Both select
`backend: "qiskit" | "pennylane"`, defaulting to Qiskit, with no fallback.
Public input selects only trusted problems; arbitrary Hamiltonians, graphs,
Python, optimizer methods and canonical circuits are not accepted at these routes.
Only this namespace adds GET/POST/DELETE CORS methods for allowed origins.

See [complete variational requests, responses, errors, lifecycle and numerical
conventions](VARIATIONAL_ALGORITHMS.md#api-contract). The result embeds the
unchanged simulation/trace schemas above, plus actual objective history and an
independent exact reference. Counts are sampled only for the final best circuit;
objective values use exact complex state expectations.
