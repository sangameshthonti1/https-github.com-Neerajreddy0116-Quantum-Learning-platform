# Quantum Learning API

Local-only FastAPI foundation for the SIH 2026 Quantum Learning Platform.
Includes API liveness, configuration, CORS, documentation, and a real local
Qiskit Aer simulator for 1–3 qubits with H/X/Z/CX gates.
There is no AI tutoring, assessment, database, authentication, algorithm library,
or learner-progress implementation yet.

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
- `/api/simulate` permits `POST` preflights with `Content-Type` for JSON bodies;
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

Tests isolate settings from the developer's `.env` and use an in-process client,
so no running server, external service, or credentials are needed. The live
`curl` commands above separately verify Uvicorn startup and real HTTP access.

Verify actual installed engine versions:

```sh
.venv/bin/python -c 'import qiskit, qiskit_aer; print("Qiskit:", qiskit.__version__); print("Aer:", qiskit_aer.__version__)'
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
│   ├── services/qiskit_simulator.py # Circuit construction and real Aer execution
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
The quantum adapter is separate from public schemas and HTTP routing. Future
rotation gates need explicit schema variants and implementations; additional
simulators must honor the same bit-ordering and measurement contract. No
unsupported feature is represented by fake results.

This is a tested foundation, not a deployed production service. Authentication,
rate limits, persistence, external integrations, and deployment configuration
remain out of scope. Individual requests are bounded (3 qubits, 256 gates,
8192 shots), but there is no aggregate rate/body limit or job queue. Keep the
server bound to loopback; this unauthenticated milestone is not public-facing. Keep this work local until the hackathon starts; do not
commit, push, or deploy it as part of this setup task.
