# Circuit Lab

An interactive React + TypeScript + Vite scientific workspace connected to the
**real local FastAPI + Qiskit Aer simulation API**. The lab is at `/`; the original
Circuit Test page remains independently accessible at `/circuit-test` with all
of its original integration assertions preserved. No new dependencies were
added for the editor. No AI, authentication, database, external fonts, unsupported
gates, or client-side simulated results are included.

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

## Using the Circuit Lab

Open **http://127.0.0.1:5173/**. The toolbar contains templates, Undo, Redo,
Reset, Run, and current/stale/error status. The left panel contains the gate
palette and settings. The central grid is the circuit; selecting a gate opens
its contextual inspector directly below the grid. The right panel contains real results.
At widths of 1000px or less, use **Gates & settings / Circuit / Results** to switch
panels. The Circuit view also keeps a compact palette and essential settings
above the grid. Selecting a gate keeps you in Circuit view. All controls work
with clicks/taps and standard keyboard activation. Desktop drag-and-drop uses
native browser support with no added dependencies.

### Build and edit

- Choose **H**, **X**, **Z**, or **CX** in the gate palette, then click an empty
  wire cell. A cell in an existing column inserts before that operation; the
  final column appends. One operation per column maps exactly to API gate order.
- For **CX**, click the **control** first, then a **different target qubit in the
  same column**. A preview marks the pending control. A solid connector joins
  the committed control dot and target symbol. Cancel CX or Escape in the grid
  abandons the incomplete placement; no partial gate enters the request.
- On desktop, drag **H**, **X**, or **Z** from the palette onto an empty wire
  cell. Dragging **CX** places its pending control; click a different wire at
  that step to finish, or cancel. Occupied cells never accept drops. Dragging
  existing gates is not supported; use Earlier / Later in the inspector.
- Alternatively, expand **Add gate with form** below the canvas: choose type, target,
  control (CX only), and insertion position, then **Add gate**.
- Click an existing gate to inspect it. **Apply gate changes** updates its type
  or qubits; **Earlier / Later** changes execution order; **Delete gate** removes
  it. **Done · place gates**, **Deselect**, a palette tool, or **Escape** returns
  to placement. Selected gates are solid slate; the active placement tool is
  outlined blue. Delete stays visible in the inspector, including on narrow
  screens. Form drafts are not part of the circuit until applied.
- Add/remove qubits within **1–3**. Removing the highest-index qubit is disabled
  while any gate touches it: move or delete those gates first. Gates are never
  silently dropped. CX requires at least two qubits.
- Enter **1–8192 integer shots**, then **Apply shots**. Run is disabled while the
  shot value is unapplied or a CX placement is incomplete. Gate limit: **256**.
- Templates replace the circuit with the existing Empty, X, H, H followed by H,
  or Bell State requests. Replacement is undoable.
- **Undo/Redo** restore complete canonical request snapshots, including settings,
  gate order, deletion, and template loading. A new edit clears redo history.
  **Reset** restores a blank **2-qubit, 1024-shot, seed-42** circuit and is itself
  undoable. History retains the last 100 edits in memory; refreshing loses it.

### Run and interpret

**Run Simulation** sends the current `SimulationRequest` unchanged to the existing
API client. A result retains a separate snapshot of the exact request that
produced it. Editing the circuit marks it **Stale** with a rerun instruction;
undoing back to that request makes it Current again. Edits remain possible during
an in-flight run: its eventual response is still compared against its original
request, never relabeled as a result of newer edits. API failures are displayed
and clear previous results instead of showing fake data.

Use the **Ideal probabilities**, **Sampled counts**, and **Statevector** result
tabs. Ideal probabilities are state-derived, not shot frequencies. Values are
formatted for reading; their full returned precision is available in **Details**.
Details also contains bit-order guidance, metadata, the current editor JSON, the successful request
snapshot, and its raw response. The backend and CORS contract are unchanged.

For a Bell circuit without using a template: keep the initial two qubits, select
H and click q0 at step 1; select CX and click q0 then q1 at step 2; Run. Expect
approximately 50% ideal probability on `00` and `11`, zero on `01` and `10`.
Sampled counts fluctuate and sum to the selected shot count.

## State Explorer

Build a circuit normally and choose **Explore steps**, or open the **State
Explorer** workspace mode and choose **Trace circuit**. The app sends the exact
canonical request to `POST /api/simulate/trace`. No frontend quantum simulator,
mock results, or AI explanation service is involved.

- Step **0** is the initial all-zero state. Each later step corresponds to the
  gate with that position and ID in the request snapshot. Choose a timeline
  marker, Previous/Next, or use the native range slider (arrow keys, Home/End).
- A blue underline highlights the corresponding circuit column; step 0 marks
  the initial wire labels. This is separate from selecting a gate for editing.
  Click a gate or choose **Circuit editor** to return to normal editing.
- **Step probabilities** and **Step statevector** use the same presentation
  components as final results. The gate explanation combines fixed operation
  descriptions with actual probability changes between adjacent snapshots.
- The **Bloch sphere** displays one reduced qubit at a time. Select q0/q1/q2,
  then use **Rotate view** to change camera azimuth and elevation. The sphere
  uses a lightweight SVG orthographic projection with no new dependency.
  Rotation changes the view only; there is no animation or automatic playback.
- Coordinates and vector length come directly from the backend Bloch vector.
  Purity is `Tr(ρ²)`, computed from its returned reduced density matrix. Vectors
  are never normalized onto the sphere: Bell's reduced qubits remain at the
  center, with purity approximately 0.5. The full joint state stays pure.
- On mobile, switch **Joint state / Qubit sphere** to keep the workspace compact;
  both views retain the same selected timeline step. Rotation and timeline
  controls work with keyboard, clicks, and taps, including reduced-motion mode.
- **View final simulation results** returns to the existing probabilities,
  sampled counts, statevector, and execution metadata. Tracing neither clears
  nor replaces the final simulation result. Intermediate states are explicitly
  labeled as ideal, before measurement, with no sampled counts.

Each trace retains its own canonical request snapshot. Applied gate, order,
qubit, shot, template, and reset changes mark it stale; its intermediate data
and highlight are hidden. Undoing to the same completed request restores it.
Edits during an in-flight trace abort that request; controller identity checks
prevent late responses or errors from overwriting a newer trace. An interrupted
trace requires a new request even if an edit is immediately undone. Unapplied
gate-form drafts do not change canonical state. Unapplied shots and pending CX
placement disable trace actions until resolved.

HTTP validation, timeout, malformed-response, engine, and network errors offer
retry and never substitute fabricated states. A trace failure clears its trace
data but does not discard a separately obtained final simulation result.
**Trace Details** preserves the request and original HTTP response text,
including raw numerical precision and signed zero. Display-only tolerance is
`1e-10`. Basis order is `q[n-1]...q[0]`; q0 is the rightmost bit. Global phase is
retained, and amplitude signs alone are not interpreted as a probability change.

For a visual Bell walkthrough, place H on q0 and CX q0→q1, then Explore steps:
initial `00: 100%`; after H, `00/01: 50%` each; after CX, `00/11: 50%` each.
At the final step both reduced Bloch vectors are approximately `(0,0,0)`.

## Preserved Circuit Test page

Open **http://127.0.0.1:5173/circuit-test** for the original integration page.

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

The browser tests use **port 5174** for their own Vite instance so an existing
frontend on 5173 can stay running. The test backend uses **8001**, leaving the
development backend on 8000 untouched. Ensure **ports 8001 and 5174 are free**, then:

```sh
npm run test:e2e
```

The bounded suite starts its own Uvicorn and Vite processes, launches headless
Chromium, and stops its owned processes afterward. It refuses to reuse an
existing server. Test server configuration is isolated with an empty CORS
allowlist and a test proxy target on port 8001; it does not edit backend settings/files.

The lab suite additionally verifies visual Bell construction and the exact real
POST, control/target editing and connectors, insertion/reordering/deletion,
Undo/Redo/Reset, limits, templates, stale results after canonical edits, edits
during an in-flight run, unchanged-gate no-op edits, keyboard interaction,
responsive panel navigation, contextual deletion/editing at 320px, Escape and
Done deselection, native H/X/Z/CX palette dragging, occupied-cell drop rejection,
and real backend outages.

The State Explorer browser suite verifies empty, H→H, and visually constructed
Bell traces; all navigation controls and gate highlights; reduced Bloch vectors
and rotation; retained final results; stale snapshots; delayed real-response
races; invalid response rejection; three-qubit mobile navigation under reduced
motion; real FastAPI validation errors; and a real test-owned backend outage.

The original Circuit Test suite still verifies:

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

1. Start both servers, open `/circuit-test`, choose **Bell State**, and run it.
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
│   ├── App.tsx              # Lazy page selection: lab /, integration /circuit-test
│   ├── CircuitTest.tsx      # Preserved original integration page
│   ├── lab/
│   │   ├── CircuitLab.tsx   # Composition, selection, pending CX, run snapshots
│   │   ├── useCircuitEditor.ts # Validated canonical request and undo/redo reducer
│   │   ├── GatePanel.tsx    # Compact palette, settings and reusable gate form
│   │   ├── GateInspector.tsx # Contextual editing, ordering, deletion and Done
│   │   ├── CircuitCanvas.tsx # Wire grid, ordered gates and CX connectors
│   │   ├── ResultsPanel.tsx # Real results, stale/error states and Details
│   │   ├── StateExplorer.tsx # Trace timeline, operation explanations, joint state
│   │   ├── BlochSphere.tsx  # Rotatable reduced-state sphere and textual values
│   │   ├── QuantumStateViews.tsx # Shared probability and amplitude presentation
│   │   ├── useStateTrace.ts # Trace snapshots, cancellation and stale state
│   │   ├── explorer.css    # Focused explorer mode and responsive views
│   │   └── lab.css         # Scoped responsive scientific workspace styles
│   ├── styles.css           # Preserved integration page styles
│   └── main.tsx             # React entry point
├── e2e/integration.spec.ts  # Preserved integration coverage at /circuit-test
├── e2e/circuit-lab.spec.ts  # Real-engine visual editor and snapshot regressions
├── playwright.config.ts
├── vite.config.ts          # Loopback dev server and same-origin API proxy
├── tsconfig.json
├── index.html
├── .env.example
├── .gitignore
├── package.json
└── package-lock.json
```
