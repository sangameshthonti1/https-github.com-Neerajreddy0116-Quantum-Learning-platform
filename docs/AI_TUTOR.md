# AI Tutor v1

Implemented on `prebuild/ai-tutor` from curriculum checkpoint `9b12c6c`.
No commit, push, publication or deployment is part of this implementation.

## What is real, and what is not yet verified

- Circuit grounding and proposal previews use **real Qiskit** through the existing `trace_circuit` service. They include ideal statevectors, probabilities and reduced states. No sampled measurement counts are generated or inferred for the tutor.
- The application uses the **official OpenAI Python SDK**, `AsyncOpenAI.responses.parse`, with Structured Outputs. There is no model double, offline answer bank or fallback chatbot in application code.
- Automated tests use deterministic provider doubles. One group exercises the actual SDK's HTTP serialization and output parser with a local HTTP transport; browser tests call actual FastAPI and Qiskit through an explicitly separate test-only entrypoint. These tests do **not** establish live model quality or account access.
- **Live provider verification is pending.** No credential was present in the process or usual local environment files during the initial inspection. No model/credential/paid-usage confirmation was received and no paid request was made.

## Architecture and source boundaries

`POST /api/ai/tutor` is an application endpoint, not a provider proxy.

1. `api/routes/tutor.py` limits streamed request bodies before JSON parsing, sanitizes validation errors, returns non-cacheable errors/responses, and cancels work on observed client disconnect.
2. `schemas/tutor.py` bounds the question/history, accepts only known lesson IDs and reuses `SimulationRequest` for circuits. Selected steps must belong to that circuit.
3. `services/tutor.py` applies admission limits, owns the end-to-end timeout, calls grounding and the provider, and independently validates and traces any proposed replacement.
4. `services/tutor_context.py` calls the existing Qiskit state-trace service in a worker thread. It never accepts client probabilities, amplitudes, Bloch vectors, snippets, provider names, model names or tools.
5. `services/tutor_lessons.py` contains a deliberately small approved subset of the four lessons. Titles/objectives and explanation excerpts are reviewed against the checkpoint; quiz answer keys, grades and experiment evidence are excluded. Maintain these excerpts alongside curriculum edits.
6. `services/tutor_provider.py` owns the educational/system instruction and makes one bounded OpenAI Responses request. It supplies no tools, disables automatic retries and sets `store=False`. Its origin is explicitly fixed to OpenAI, preventing `OPENAI_BASE_URL` from redirecting the API key. Only the implemented provider name `openai` is currently accepted.
7. The frontend `TutorProvider` connects the shell to the canonical Lab request and selected current trace step. `TutorPanel` owns temporary conversation state, request cancellation and explicit proposal confirmation. `api/tutorClient.ts` validates response shape, request identity, probability/amplitude consistency and proposal constraints before rendering.

Trusted educational rules are supplied as `instructions`. Server-derived facts use a separate developer message. Questions and all claimed conversation roles are encoded as **untrusted data inside one user message**, so a forged assistant-history item cannot become a trusted system/developer instruction. Client gate IDs are omitted from model context. There is no repository retrieval, arbitrary URL fetch, code execution, circuit mutation tool, grading tool or evidence-writing capability.

## Contract

Request example:

```json
{
  "question": "Why does H give 50% and 50%?",
  "mode": "circuit",
  "lessonId": "superposition",
  "circuit": {
    "numQubits": 1,
    "gates": [{"id": "h1", "type": "h", "targets": [0], "controls": []}],
    "shots": 1024,
    "backend": "qiskit",
    "seedSimulator": 42
  },
  "selectedStep": 1,
  "history": []
}
```

`mode` is `learn` (default) or `circuit`; circuit mode requires a circuit. Empty gates are valid. `lessonId`, `circuit` and `selectedStep` are nullable; an omitted step means final state. Step 0 is the initial all-zero state, step k is after the kth gate.

Response fields:

| Field | Origin and meaning |
| --- | --- |
| `answer`, `deeper`, `followUp` | Validated AI explanation; optional extra detail and one follow-up |
| `explanationSource` | Always `ai`; never a simulator authority badge |
| `lessonId` | Validated current lesson identifier |
| `facts` | Nullable backend-computed `CircuitFacts` for the **submitted** circuit |
| `suggestion` | Nullable validated complete replacement: title, rationale, canonical circuit, and its own freshly computed facts |

`CircuitFacts` contains `source: "qiskit-trace"`, `bitOrder: "q[n-1]...q[0]"`, `samplingPerformed: false`, the canonical `circuit`, `selectedStep`, `totalSteps`, and selected `snapshots` with the existing `TraceStep` fields. At most 17 snapshots are included: all steps for circuits of up to 16 gates; otherwise initial, first, preceding selected, selected and final (deduplicated). All ordered gates are included in model context, without IDs. The context explicitly marks whether snapshots are complete. It never claims unprovided intermediate values or sampled counts are verified.

Suggestions use a deliberately simpler provider schema (gate type, target, nullable control); the server assigns IDs, preserves current shots/seed, and converts through the **existing canonical circuit schema**, including distinct control/target, unique IDs and in-range wires. Suggestions are limited to 32 gates. Invalid, unsupported, refused or incomplete provider output returns an error, with **no fabricated replacement answer**.

## Configuration and cost controls

Copy the safe template `backend/.env.example` to an ignored local `backend/.env` if needed. Set credentials only through a secure local mechanism; never paste them into chat or a frontend variable. Neither this work nor the test suite creates or saves a key.

| Setting | Default / bound |
| --- | --- |
| `OPENAI_API_KEY` | Missing; server only, represented with `SecretStr` |
| `QLP_AI_ENABLED` | `false`; explicit operator opt-in required |
| `QLP_AI_PROVIDER` | `openai`; unsupported names fail configuration |
| `QLP_AI_MODEL` | Empty; explicitly choose a model your API project can access that supports Responses and Structured Outputs |
| `QLP_AI_MAX_OUTPUT_TOKENS` | 1600; configurable 256–4096 |
| `QLP_AI_TIMEOUT_SECONDS` | 30; configurable 1–45 seconds, including grounding and output validation |
| `QLP_AI_MAX_CONCURRENCY` | 2; configurable 1–8 active requests per process; excess requests are rejected, not queued |
| `QLP_AI_REQUESTS_PER_MINUTE` | 20; configurable 1–120, rolling global per-process limit |

No application model name is inferred from the coding agent. The SDK version is pinned to `openai==3.8.0`; its additional runtime dependencies are pinned in `backend/requirements.txt`. The SDK's `httpx2`, `httpcore2` and `truststore` transport dependencies previously existed in the test snapshot and now belong to the runtime snapshot. There are no new frontend dependencies.

The HTTP request is capped at 64 KiB with a 5-second body-read deadline. Questions and individual history items are limited to 2000 characters; history is capped at 8 items / 8000 total characters. The frontend sends at most the last two successful exchanges for the exact current lesson/circuit/step. It displays at most 12 turns. Output strings are bounded independently of token limits.

The Vite proxy gives only `/api/ai` a 60-second deadline; existing simulation/trace deadlines remain 15 seconds. The frontend tutor deadline is 55 seconds. No automatic retry occurs anywhere in the tutor path. An explicit Retry makes another potentially billable request. Cancellation stops accepting late answers and attempts to cancel server/provider work, but already-started provider computation may still be billed. Local Qiskit worker computation cannot be forcibly interrupted, and is bounded by the existing 3-qubit / 256-gate contract.

`store=False` disables Responses application storage; it is **not** a promise of zero provider retention. Apply your project's data controls and privacy policy before collecting real learner data. The key and configuration are never put into the prompt, product response or application log.

## Errors

All tutor errors have `{ "error": { "code": "...", "message": "..." } }` and `Cache-Control: no-store`.

| Status | Examples |
| --- | --- |
| 408 | `request_timeout`: body arrival too slow |
| 413 | `request_too_large` |
| 422 | `invalid_request`: bounds, unknown fields, unknown lesson, invalid step or unsupported circuit |
| 429 | `tutor_busy`, `tutor_rate_limited`; includes conservative `Retry-After: 60` |
| 499 | `request_cancelled`: client disconnect detected |
| 502 | `provider_unavailable`, `invalid_provider_response`, `tutor_failed` |
| 503 | `tutor_not_configured`, `grounding_failed` |
| 504 | `tutor_timeout` |

Raw provider errors, secret values, request bodies and attacker-controlled gate IDs are never reflected in error messages. An invalid circuit is explained deterministically at validation; it is not submitted to the LLM or simulator.

## Student experience and integrity

Open **AI Tutor** from the shell while in any of the four lessons, Circuit Lab or State Explorer. The launcher waits for Lab context to finish loading. The desktop drawer overlays the right edge; mobile uses the whole viewport, preserving the underlying canvas dimensions. A native modal dialog plus explicit Tab wrapping keeps keyboard focus inside; Escape/Close restores the launcher.

The tutor offers contextual starting questions, recent chat, optional deeper explanation, distinct Qiskit facts, loading/cancel/retry/errors and clear. Text is rendered with React text nodes and `white-space: pre-wrap`; no HTML, markdown injection, active generated links or scripts are rendered.

Changing the current lesson/circuit/step cancels an in-flight answer. Older messages retain their context label but are excluded from new-context history; old proposals cannot be applied to a different circuit/step. No tab memory or account history is sent to OpenAI. Chat is held in memory, is not persisted, and is discarded on reload, clear or leaving learning workspaces.

A proposal first appears with **Preview circuit**. Expanding it shows the complete gate order, qubit count, fresh Qiskit facts and replacement warning. **Confirm replacement** is the only path to `useCircuitEditor`'s canonical `replace` action; it remains undoable. Suggestions in lessons are informational; apply them by requesting a proposal in the relevant Lab workspace. The tutor never calls simulation-run/evidence-collection/grading actions or marks a reading complete. Existing deterministic progress and grading remain authoritative.

AI prose is always labeled as AI and can still contain mistakes. Numerical facts come solely from the independent Qiskit panel; the product never parses AI prose into simulator bars or grading data. There is **no comprehensive semantic contradiction detector** for arbitrary prose. Structured validation and instructions cannot establish that every explanation is correct.

## Verification

The final backend run passed **414 tests** (5.30 seconds). The complete browser
suite passed **99 tests** (3.4 minutes), including all 84 existing tests and 15
tutor tests. TypeScript checks, the production frontend build, `pip check` and
`git diff --check` passed. An initial browser run exposed focus/context-loading
races; the final run verifies their fixes. The disconnect cleanup regression is
also fixed and covered by immediate-configuration-error and disconnect tests.

The isolated review instance uses frontend `http://127.0.0.1:5175` and backend
`http://127.0.0.1:8002`, with AI explicitly disabled. A separate Chromium check
verified a real Bell trace at step 2, the actual HTTP 503 configuration error,
390-pixel mobile layout and no JavaScript errors or Vite error overlay. Existing
developer servers on ports 5173/8000 were left running unchanged.

Commands (Python 3.13, existing project environments):

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
cd ../frontend
npm run typecheck
npm run build
npm run test:e2e
```

`tests/test_tutor.py` covers limits, configuration, failures/timeouts, admission, disconnects, real circuit/trace grounding, context isolation, proposals, and preservation of simulation/trace behavior. `test_tutor_provider.py` uses the real SDK parser against a local transport double. `e2e/tutor.spec.ts` uses `tests/tutor_browser_app.py`, a **test-only server entrypoint** never imported or enabled by product code, plus a separate actually unconfigured product backend test. Browser tests preserve the original lesson/Lab workflows and cover accessibility, mobile width, injection resistance, stale context, cancellation, preview/confirmation and Undo.

Desktop, proposal and mobile screenshots and real H context JSON are written to ignored Playwright `frontend/test-results/` output. Those screenshots explicitly say “provider test double”; they are not evidence of live AI quality.

### Pending bounded live acceptance check

Only after the user confirms credential reuse/new setup, API model, and paid request/token or spending limits:

1. Enable the chosen backend settings; use a dedicated project with a budget/usage control.
2. Make one H(q0) request with the exact question **“Why does H give 50% and 50%?”**, selected step 1, no history. Verified state: amplitudes approximately `[0.70710678, 0.70710678]`, probabilities `{0: 0.5, 1: 0.5}`, reduced Bloch `(1, 0, 0)`, no sampled counts.
3. Record the exact model, configured token cap, question, actual backend context, actual response and observed usage. Check that it distinguishes amplitudes from probabilities, explains H's fixed transformation, and does not claim sampled counts.
4. If separately authorized, ask **“Why are the Bell state's Bloch vectors at the center?”** for H(q0) then CX(q0→q1), step 2. Check joint purity versus local maximal mixing and the limitation of correlation alone.
5. Run the remaining requested beginner prompts as a reviewed educational evaluation when a separate usage budget is available. Record failures rather than treating a smoke test as comprehensive quality validation.

No live response or agreement assessment has been recorded yet.

Official implementation reference: [OpenAI Structured Outputs with Responses and
Python `responses.parse`](https://developers.openai.com/api/docs/guides/structured-outputs).

## Changed-file inventory

New backend application modules:

- `backend/app/api/routes/tutor.py`
- `backend/app/core/tutor_config.py`
- `backend/app/schemas/tutor.py`
- `backend/app/services/tutor.py`
- `backend/app/services/tutor_context.py`
- `backend/app/services/tutor_lessons.py`
- `backend/app/services/tutor_provider.py`

New frontend modules:

- `frontend/src/api/tutorClient.ts`
- `frontend/src/tutor/TutorProvider.tsx`
- `frontend/src/tutor/TutorPanel.tsx`
- `frontend/src/tutor/types.ts`
- `frontend/src/tutor/tutor.css`

New verification files:

- `backend/tests/test_tutor.py`
- `backend/tests/test_tutor_provider.py`
- `backend/tests/tutor_browser_app.py` (test-only provider double)
- `frontend/e2e/tutor.spec.ts`

Existing integration/configuration files updated:

- `backend/app/api/router.py`, `backend/app/main.py`
- `backend/.env.example`, `backend/requirements.txt`, `backend/requirements-dev.txt`
- `backend/tests/conftest.py` (isolate AI settings from developer credentials)
- `frontend/src/App.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/lab/CircuitLab.tsx`
- `frontend/vite.config.ts` (AI-specific timeout)
- `backend/README.md`, `frontend/README.md`, `docs/API_CONTRACT.md`
- `docs/AI_TUTOR.md` (new implementation/verification report)

Existing Qiskit services, canonical circuit/trace schemas, lesson grading,
curriculum content and editor logic were not changed. No real env file was
created or modified. The React review workflow guided the focus, bounded local
state, cancellation and stable Lab-context integration.

## Before public deployment

This is a production-minded local v1, **not production-grade public security**. Required next work includes authenticated users, shared per-user quotas and spend budgets, distributed admission/rate limits, trusted reverse-proxy configuration, ingress body/time/connection limits, abuse prevention, privacy/retention policy (including age-appropriate handling), secret management/rotation, redacted operational monitoring and alerts, model-quality and prompt-injection evaluations, and incident handling. The current global process limiter resets on restart, multiplies across workers and can be exhausted by any caller; it is a local guardrail, not public abuse protection. CORS is not authentication. Do not expose this unauthenticated paid endpoint publicly.

This milestone intentionally has no streaming, durable history, account integration, quiz grading by AI, arbitrary code sandbox, general provider proxy or deployment automation.
