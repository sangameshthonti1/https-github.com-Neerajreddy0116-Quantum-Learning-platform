# Quantum Learning Platform

SIH 2026 interactive quantum learning platform.

## Run locally

Install the documented frontend and backend dependencies first. Then start both
FastAPI and Vite from one terminal:

```sh
cd frontend
npm run dev:full
```

Keep the terminal open and visit <http://127.0.0.1:5173>. The launcher reuses a
healthy server that is already running, starts whichever side is missing, and
stops the processes it owns when you press Ctrl+C.

## Publish the full-stack demo

The repository includes a production `Dockerfile` and `render.yaml`. One service
builds the React frontend, serves it from FastAPI, and keeps every `/api` request
on the same origin. Public mode adds global request-body, write-rate, and compute
concurrency limits. The health check is `/api/health`.

To publish with Render:

1. Sign in at <https://dashboard.render.com> with GitHub.
2. Choose **New → Blueprint** and select this repository.
3. Approve the `quantum-learning-platform` service from `render.yaml`.
4. Wait for the Docker build and health check, then open the generated `onrender.com` URL.

The blueprint requests Render's free plan and leaves the optional AI Tutor
disabled, so no OpenAI key is needed. Free instances may sleep and take time to
wake. This remains an unauthenticated educational demo: progress, Library unlocks,
and the ₹9/₹0 billing demonstration are browser-local, not user accounts or real
payments. If AI is enabled later, add `OPENAI_API_KEY`, `QLP_AI_MODEL`, and
`QLP_AI_ENABLED=true` only as secret server environment variables; provider usage
may cost money and sends submitted Tutor context to that provider.
