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
