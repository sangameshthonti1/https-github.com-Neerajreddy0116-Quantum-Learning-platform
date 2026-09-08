# Quantum Learning API

Local-only FastAPI foundation for the SIH 2026 Quantum Learning Platform.
Includes API liveness, configuration, CORS, documentation, and a real local
Qiskit Aer simulator (default) and independent PennyLane `default.qubit` simulator
for 1–3 qubits with 16 native gates, parameterized rotations,
and a bounded OpenQASM 3 subset parser. See [the code/engine contract](../docs/CIRCUIT_CODE.md).
An optional contextual AI Tutor uses server-side OpenAI Responses and verified
Qiskit traces; it is disabled until configured. Eight circuit challenges use
server-side grading. There is no database, authentication, or server-side
learner-progress storage. The bounded
Algorithm Explorer now provides real Deutsch–Jozsa and Grover circuits through
`GET /api/algorithms`, `POST /api/algorithms/build`, and `POST /api/algorithms/run`.
See [supported variants, contracts, and verification](../docs/ALGORITHM_EXPLORER.md).

## Python and isolation

Use **Python 3.13**; this foundation was verified with **3.13.7** on macOS Apple Silicon.
`.python-version` records the tested interpreter; it does not install Python.
Do not use the machine's default Python blindly or install packages globally.

The existing isolated environment now runs **Qiskit 2.5.2** and **Qiskit Aer
0.17.2**, installed from compatible binary wheels. The real engine is tested,
not merely dependency-resolved. Runtime and transitive versions are pinned in
`requirements.txt`; the original FastAPI dependency pins are preserved.
The NumPy/SciPy wheels resolved on this Apple Silicon machine target macOS 14+;
recheck wheel availability before setup on a different operating system.

The second engine is **PennyLane 0.45.1**, verified in the same Python 3.13.7
environment without changing any existing Qiskit, FastAPI, NumPy or SciPy pin.
Its package metadata requires Python ≥3.11 and NumPy ≥2.0. The required
`pennylane-lightning==0.45.0` distribution is installed transitively, but execution
uses the Python/NumPy `default.qubit` device. No JAX, Torch or PennyLane-Qiskit
converter is installed. All added dependencies are pinned in `requirements.txt`;
`packaging==26.3` moved from test-only to runtime requirements at the same version.
See [the dependency and verification report](../docs/PENNYLANE_BACKEND.md).

## Setup

From the repository root, with `python3.13` already available:

```sh
cd backend
python3.13 --version
# First setup only; skip creation when the project .venv already exists.
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pip check
```

These commands install only into `backend/.venv`; shell activation is not required.
`requirements.txt` pins the runtime dependencies, including their transitive
dependencies. `requirements-dev.txt` adds pinned pytest/HTTPX2 dependencies
(HTTPX2 is the test-client integration recommended by the pinned Starlette).
For a runtime-only environment, install `requirements.txt` instead.
Package installation requires access to PyPI; running the API and tests does not.

Optional local configuration (run once, only if `.env` does not already exist):

```sh
cp -n .env.example .env
```

Edit the local `.env` to match the frontend you actually run. No credentials are
required. Never commit `.env` or other secrets; `.env.example` is intentionally safe to track.

## Run

From `backend/`:

```sh
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --reload
```

Keep that terminal open; stop the server with **Ctrl+C**. The command binds to
loopback only. `--reload` is for local development, not production. Changes to
`.env` require a server restart. If port 8000 is occupied, identify its owner;
do not kill unrelated processes.

In a second terminal:

```sh
curl --fail-with-body --silent --show-error --noproxy '*' http://127.0.0.1:8000/api/health
```

Expected HTTP status: **200**, with exactly:

```json
{"status":"ok","service":"quantum-learning-api"}
```

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Process liveness; no external dependencies are probed |
| `POST /api/simulate` | Real ideal-state simulation and sampled terminal measurements |
| `POST /api/simulate/trace` | Initial and per-gate states, probabilities, reduced density matrices and Bloch vectors |
| `GET /` | HTTP 307 redirect to `/docs` |
| `GET /docs` | Automatic Swagger UI |
| `GET /openapi.json` | Generated OpenAPI schema |

FastAPI's default Swagger UI loads browser assets from a public CDN. The docs
HTML and OpenAPI schema are served locally, but rendering the interactive UI
requires browser internet access. No API data is sent to an AI or quantum service.

## Simulate a Bell state

With the server running, from any terminal:

```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H 'Content-Type: application/json' \
  --data '{"numQubits":2,"gates":[{"id":"g1","type":"h","targets":[0],"controls":[]},{"id":"g2","type":"cx","targets":[1],"controls":[0]}],"shots":1024,"backend":"qiskit","seedSimulator":42}' \
  http://127.0.0.1:8000/api/simulate
```

Expected ideal probabilities are approximately 0.5 for `00` and `11`, zero for
`01` and `10`. Counts come from Aer and sum to 1024; do not expect exactly half
in each state. The statevector is saved before implicit all-qubit terminal
measurement. Explicit measurement gates are rejected, not silently removed.
Qubit 0 is the rightmost bit in labels. See [the complete API contract](../docs/API_CONTRACT.md)
for schemas, limits, bit ordering, measurement semantics, metadata, and errors.

To run the identical Bell circuit in PennyLane, change only `"backend":"qiskit"`
to `"backend":"pennylane"` in either example. Omission now defaults to Qiskit;
other names (including `"default.qubit"`) return HTTP 422. Qiskit responses retain
their existing version fields; PennyLane returns `pennylaneVersion` and
`engine: "pennylane.default.qubit"`. There is no engine fallback.

Both engines support H, X, Y, Z, S, S†, T, T†, RX, RY, RZ, P, CX, CZ, SWAP and
CCX. Exact probabilities come from the analytic state, while counts come from
the selected framework's finite-shot simulator. Replaying a seed reproduces
counts within one pinned engine/configuration; the same seed need not produce
identical counts across frameworks. Ideal states do not depend on shots or seed.

## Trace a Bell state

Send the identical request to the dedicated trace endpoint:

```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H 'Content-Type: application/json' \
  --data '{"numQubits":2,"gates":[{"id":"g1","type":"h","targets":[0],"controls":[]},{"id":"g2","type":"cx","targets":[1],"controls":[0]}],"shots":1024,"backend":"qiskit","seedSimulator":42}' \
  http://127.0.0.1:8000/api/simulate/trace
```

The response has three ordered steps: initial `|00⟩`, H on q0, and CX q0→q1.
Each step contains a full pre-measurement statevector, dense ideal probabilities,
and each qubit's reduced density matrix and Bloch vector. The final probabilities
are approximately 50% each on `00`/`11`, and both reduced qubits are maximally
mixed (`I/2`) with zero-length Bloch vectors. Qiskit's `Statevector.evolve` and
`partial_trace` compute these states; no counts or mid-circuit measurements are
used. Shots and seed are validated but do not affect the trace. Native global
phase is retained; physical comparisons should be phase-invariant.

PennyLane traces use one real `default.qubit` execution with `Snapshot` at step
zero and after each gate. Explicit device/count wire order `[n-1, ..., 0]` keeps
q0 rightmost. `qml.math.reduce_statevector` traces out the other tensor positions.
The returned density matrices and Bloch vectors support the existing State
Explorer, including purity `Tr(ρ²)` computed from each matrix. Bell/GHZ reduced
qubits have purity 0.5, while the joint state is pure. No snapshots are rephased,
rounded, renormalized or reconstructed from counts.

See [the trace contract](../docs/API_CONTRACT.md#post-apisimulatetrace) for the
complete schema, conventions, numerical tolerance, bounds, and error envelopes.

## Configuration and CORS

Settings are validated at application creation. OS environment variables override
`backend/.env`, which overrides defaults. The `.env` path is resolved relative to
the backend source, not the shell working directory. Unknown dotenv keys are
ignored, so a shared local environment file can contain other modules' settings.

| Variable | Default | Format |
| --- | --- | --- |
| `QLP_API_TITLE` | `Quantum Learning API` | Nonempty string; OpenAPI title |
| `QLP_CORS_ORIGINS` | `[]` | JSON array of exact HTTP(S) frontend origins |

Example `.env` entry, only if both frontends are explicitly intended:

```dotenv
QLP_CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]
```

- No origins are allowed by default. There is no wildcard or origin regex.
- `localhost` and `127.0.0.1`, different ports, and different schemes are distinct origins.
- Wildcards, credentials, non-root paths, queries, fragments, and malformed values
  fail validation at startup. A trailing root slash and default ports are normalized.
- `/api/simulate` and `/api/simulate/trace` permit `POST` preflights with `Content-Type` for JSON bodies;
  other paths retain `GET`-only permissions. Credentials and Authorization are
  disabled. Extend permissions deliberately when real endpoints need them.
- Disallowed preflights return HTTP 400 when CORS is configured. Ordinary requests
  from disallowed origins receive no `Access-Control-Allow-Origin` header.
  CORS controls browser access; it is **not authentication or a firewall**.

## Test

From `backend/`:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
```

All original foundation tests are preserved. New tests use the real Aer engine
for identity, H/X/Z/CX, interference, entanglement, bit ordering, normalization,
JSON serialization, and seeded sampling. They also test request limits/errors,
execution-failure handling, and path-specific CORS. Statistical checks use
tolerances rather than hardcoded stochastic counts.

`test_pennylane_parity.py` adds real cross-engine comparisons for all gates and
operand orders, basis truth tables, rotations, Bell/GHZ and partly entangled
states, global phase, every trace step, reduced states, Bloch vectors and purity.
It also checks bounded sampling/seeds, concurrency, both algorithm builders, and
that PennyLane executes without invoking Qiskit. `test_pennylane_api.py` covers
shared validation, limits, engine metadata, failure paths, and unchanged challenge
grading. See [the verification report](../docs/PENNYLANE_BACKEND.md) for counts
and numerical results.

Trace tests additionally check all intermediate Bell states, reduced mixed states,
both CX directions, three-qubit spectators and GHZ states, complex Bloch-Y signs,
global-phase equivalence, every prefix against real Aer, all 257 snapshots at
the gate limit, and failure handling for invalid or nonfinite engine output.

Tests isolate settings from the developer's `.env` and use an in-process client,
so no running server, external service, or credentials are needed. The live
`curl` commands above separately verify Uvicorn startup and real HTTP access.

Verify actual installed engine versions:

```sh
.venv/bin/python -c 'import qiskit, qiskit_aer, pennylane; print("Qiskit:", qiskit.__version__); print("Aer:", qiskit_aer.__version__); print("PennyLane:", pennylane.__version__)'
```

## Layout and extension boundaries

```text
backend/
├── app/
│   ├── main.py                 # Application factory and middleware wiring
│   ├── core/
│   │   ├── config.py          # Validated environment settings
│   │   └── cors.py            # Path-specific CORS method permissions
│   ├── schemas/simulation.py  # Backend-independent request/response models
│   ├── schemas/trace.py       # Per-step trace and reduced-state response models
│   ├── services/qiskit_simulator.py # Circuit construction and real Aer execution
│   ├── services/qiskit_trace.py # Qiskit state evolution and partial traces
│   ├── services/simulators.py   # Explicit dispatch over the shared circuit contract
│   ├── services/pennylane_simulator.py # Independent default.qubit execution and tracing
│   ├── services/simulation_errors.py # Shared execution failure type
│   └── api/
│       ├── router.py           # /api route composition
│       └── routes/
│           ├── health.py       # Liveness contract
│           └── simulation.py   # Simulation HTTP/error boundary
├── tests/                      # Isolated configuration and HTTP tests
├── .env.example
├── .python-version
├── pytest.ini
├── requirements.txt            # Pinned runtime snapshot
└── requirements-dev.txt        # Pinned test additions
```

Add future endpoint routers under `app/api/routes/` and register them in
`app/api/router.py`. Keep quantum engine adapters, AI service clients, and
assessment logic in separate service/domain modules rather than putting that
logic into route handlers. `create_app()` is the composition point;
`app.state.settings` exposes its settings for future dependency injection.
The quantum adapter is separate from public schemas and HTTP routing. Rotation
gates use explicit schema variants and one-angle radian parameters; additional
simulators must honor the same bit-ordering and measurement contract. No
unsupported feature is represented by fake results.

`SimulatorAdapter` holds two callables (`simulate`, `trace`); the two engine
implementations own circuit construction and state extraction. HTTP routes
validate once with `SimulationRequest`, then dispatch. Imports are lazy, so
Qiskit requests do not initialize PennyLane. A future engine would implement
these callables, add its explicit name/metadata types, and pass the same parity
and validation suites; no additional engines or generic plugin registry exist.

Algorithm requests also accept optional `backend: "qiskit" | "pennylane"`.
Deutsch–Jozsa and Grover builders, oracle rules and interpretation stay intact.
Challenge grading deliberately remains authoritative Qiskit Aer, regardless
of the Lab selector. Tutor grounding stays Qiskit and its live provider remains
disabled. Limits remain 3 qubits, 256 gates and 8192 shots. Neither engine supports
noise, mid-circuit measurement, initial-state overrides or quantum hardware here.

This is a tested foundation, not a deployed production service. Authentication,
rate limits, persistence, external integrations, and deployment configuration
remain out of scope. Individual requests are bounded (3 qubits, 256 gates,
8192 shots), but there is no aggregate rate/body limit or job queue. Keep the
server bound to loopback; this unauthenticated milestone is not public-facing. Keep this work local until the hackathon starts; do not
commit, push, or deploy it as part of this setup task.
## AI Tutor v1

The optional `POST /api/ai/tutor` integration uses the official OpenAI Responses
SDK. It defaults to disabled and requires a server-side key, explicit model and
`QLP_AI_ENABLED=true`. No live request is needed for tests. See
[AI Tutor setup, architecture and limits](../docs/AI_TUTOR.md) before enabling usage.
