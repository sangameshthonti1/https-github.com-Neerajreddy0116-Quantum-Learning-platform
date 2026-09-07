# Circuit Test — first frontend integration

A single React + TypeScript + Vite page connected to the **real local FastAPI
simulation API**. This is a functional integration milestone, not the full
website. No AI, authentication, database, external fonts, or chart library.

## Requirements and install

- Node.js **22.12+** (verified locally with **25.9.0**) and npm (verified **11.12.1**).
- The existing backend virtual environment and pinned dependencies from
  [`backend/README.md`](../backend/README.md).

From the repository root:

```sh
cd frontend
npm ci --cache .npm-cache
```

All packages install locally in `frontend/node_modules`. The checked-in-intended
`package-lock.json` pins the dependency tree; keep it with `package.json` when
this work is eventually approved for version control. Do not commit/push during
this task. The initial setup requires npm registry access; using the page does
not call any remote service.

## Start both servers

**Terminal 1 — from the repository root:**

```sh
cd backend
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — from the repository root:**

```sh
cd frontend
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep both terminals open; Ctrl+C stops each server.
Vite binds to loopback and refuses to silently change ports if 5173 is occupied.
Identify existing port owners rather than stopping unrelated processes.

### API connection and CORS

The browser posts to **`/api/simulate` on the Vite origin**. Vite proxies `/api`
server-to-server to **`http://127.0.0.1:8000`** without rewriting the path. This
uses the real API while keeping browser requests same-origin. The backend's
explicit CORS allowlist remains unchanged; `QLP_CORS_ORIGINS=[]` works.

The default needs no `.env` file. To change the backend's local address:

```sh
# Run once, without overwriting an existing local .env:
cp -n .env.example .env
```

Edit `API_PROXY_TARGET` in `frontend/.env` to a loopback HTTP(S) origin and restart
Vite. This setting is read by the development server, not embedded in the browser
bundle. No API keys are needed. Never put secrets in `VITE_*` variables: those
are public browser configuration.

The Vite proxy is **development-only**. `npm run build` produces static files,
not a backend or deployed reverse proxy. A future hosting setup must explicitly
route same-origin `/api` requests to FastAPI; deployment is outside this milestone.

## Circuit Test page

Select **Empty**, **X**, **H**, **H followed by H**, or **Bell State**, inspect
the ordered gates and exact JSON, then click **Run Simulation**.

Each template uses 1024 shots, the `qiskit` backend, and seed 42 for repeatable
local testing. The selector offers circuit inputs, never cached simulation
outputs. The page contains no mock results or client-side quantum simulator.

The response renders:

- Ideal-probability meters and percentages for every basis state.
- Actual sampled counts, including zero-count states.
- Real and imaginary statevector components with full-precision raw JSON available.
- Backend identifier and all execution metadata, including actual engine versions.

The client reads `docs/API_CONTRACT.md`'s fields, validates the JSON response
shape and basic state/count consistency, and sends no credentials. Requests have
a 15-second client timeout; this does not cancel work already executing in Aer.
Requests abort on page unmount. Duplicate runs are disabled while loading.

Selecting another template or rerunning clears previous results. HTTP validation
errors show field locations and messages; execution, network/proxy, timeout, and
invalid-response errors are displayed rather than replaced with fake data.

**Quantum semantics:** q0 is the rightmost/least-significant bit. The statevector
and ideal probabilities are pre-measurement; counts are terminal measurements of
all qubits. Probabilities are formatted for display, not calculated from counts.
See [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) for the exact API semantics.

## Checks

Frontend type check and production build, from `frontend/`:

```sh
npm run build
```

Backend regression suite, from `backend/`:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
```

### Real Chromium integration tests

Install the test-only browser inside the project's ignored `node_modules`
(no global browser install):

```sh
# From frontend/
npm run browser:install
```

This downloads Chromium and its support binaries from Playwright's CDN. It is
needed only for browser tests, not for running/building the frontend.

Stop your manually started servers first so **ports 8000 and 5173 are free**, then:

```sh
npm run test:e2e
```

The bounded suite starts its own Uvicorn and Vite processes, launches headless
Chromium, and stops its owned processes afterward. It refuses to reuse an
existing server. Test server configuration is isolated with an empty CORS
allowlist and the default proxy target; it does not edit backend settings/files.

The suite verifies:

1. All five templates execute against actual Aer and render the response. Bell
   probabilities are approximately 50% for `00` and `11`; counts sum to 1024.
2. Loading state and disabled controls while a real request is delayed in transit.
3. A real FastAPI 422 response, obtained by changing an outgoing request's shots
   to zero in the test, is displayed correctly. No validation response is faked.
4. After a successful Bell result, stopping the **test-owned** backend produces a
   real proxy failure. The page shows an error and removes the old results.

Browser screenshots and traces are kept under ignored `test-results/`.
The real Bell response is printed to the test log and attached to the test result.
Tests compare stochastic counts to the returned response/statistical tolerance,
not to hardcoded random-count values. Analytical expected probabilities appear
only in test assertions, never as application output.

### Manual verification

1. Start both servers, open the browser URL, choose **Bell State**, and run it.
2. Confirm the `00`/`11` bars show about **50%** each, `01`/`10` show **0%**,
   counts total **1024**, and the returned metadata identifies Qiskit/Aer.
3. Stop only your backend terminal with Ctrl+C, leaving Vite running.
4. Click Run Simulation again: an API-unavailable error must replace the results.
5. Restart the backend and retry to recover.

## Layout

```text
frontend/
├── src/
│   ├── api/types.ts         # Backend-independent JSON contract
│   ├── api/client.ts        # Fetch, response checks, timeout and error messages
│   ├── templates.ts         # Circuit input templates only
│   ├── App.tsx              # Circuit Test page and real-response display
│   ├── styles.css           # Responsive styles and native probability meters
│   └── main.tsx             # React entry point
├── e2e/integration.spec.ts  # Real-engine browser checks and owned backend lifecycle
├── playwright.config.ts
├── vite.config.ts          # Loopback dev server and same-origin API proxy
├── tsconfig.json
├── index.html
├── .env.example
├── .gitignore
├── package.json
└── package-lock.json
```
