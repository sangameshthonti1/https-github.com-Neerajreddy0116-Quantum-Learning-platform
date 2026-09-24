import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const frontendDirectory = fileURLToPath(new URL("../", import.meta.url));
const backendDirectory = fileURLToPath(
  new URL("../../backend/", import.meta.url),
);
const backendPython = fileURLToPath(
  new URL("../../backend/.venv/bin/python", import.meta.url),
);
const viteCli = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

const children = [];
let stopping = false;
let liveChildren = 0;
let resolveStopped;
const stopped = new Promise((resolve) => {
  resolveStopped = resolve;
});

async function request(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(1_000) });
  } catch {
    return null;
  }
}

async function backendReady() {
  const response = await request("http://127.0.0.1:8000/api/health");
  if (!response?.ok) return false;
  try {
    const body = await response.json();
    return body.status === "ok" && body.service === "quantum-learning-api";
  } catch {
    return false;
  }
}

async function frontendReady() {
  const response = await request("http://127.0.0.1:5173/");
  if (!response?.ok) return false;
  try {
    return (await response.text()).includes("/src/main.tsx");
  } catch {
    return false;
  }
}

function portIsTaken(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(true);
      else reject(error);
    });
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(false)));
  });
}

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  }
  const deadline = setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
  }, 5_000);
  deadline.unref();
}

function track(child, label) {
  children.push({ child, label });
  liveChildren += 1;
  child.once("exit", (code, signal) => {
    liveChildren -= 1;
    if (!stopping) {
      console.error(
        `\n${label} stopped unexpectedly (${signal ?? `exit ${code ?? 1}`}).`,
      );
      process.exitCode = code ?? 1;
      stopChildren();
    }
    if (liveChildren === 0) resolveStopped();
  });
}

async function waitFor(label, check) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready within 30 seconds.`);
}

async function start() {
  await access(backendPython);
  await access(viteCli);

  const hasBackend = await backendReady();
  const hasFrontend = await frontendReady();

  if (process.argv.includes("--check")) {
    console.log("Local launcher prerequisites are available.");
    console.log(`FastAPI port 8000: ${hasBackend ? "ready" : "not running"}`);
    console.log(`Vite port 5173: ${hasFrontend ? "ready" : "not running"}`);
    return;
  }

  if (!hasBackend) {
    if (await portIsTaken(8000)) {
      throw new Error(
        "Port 8000 is occupied by another process that is not the Quantum Learning API.",
      );
    }
    console.log("Starting FastAPI on http://127.0.0.1:8000 ...");
    track(
      spawn(
        backendPython,
        [
          "-m",
          "uvicorn",
          "app.main:create_app",
          "--factory",
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
          "--reload",
        ],
        { cwd: backendDirectory, env: process.env, stdio: "inherit" },
      ),
      "FastAPI",
    );
  } else {
    console.log("Using the existing FastAPI server on port 8000.");
  }

  if (!hasFrontend) {
    if (await portIsTaken(5173)) {
      throw new Error(
        "Port 5173 is occupied by another process that is not this Vite app.",
      );
    }
    console.log("Starting Vite on http://127.0.0.1:5173 ...");
    track(
      spawn(
        process.execPath,
        [viteCli, "--host", "127.0.0.1", "--port", "5173"],
        { cwd: frontendDirectory, env: process.env, stdio: "inherit" },
      ),
      "Vite",
    );
  } else {
    console.log("Using the existing Vite server on port 5173.");
  }

  await Promise.all([
    waitFor("FastAPI", backendReady),
    waitFor("Vite", frontendReady),
  ]);

  console.log("\nQuantum Learning Platform is ready:");
  console.log("  App:      http://127.0.0.1:5173");
  console.log("  Library:  http://127.0.0.1:5173/library");
  console.log("  API:      http://127.0.0.1:8000/api/health");
  if (children.length)
    console.log("\nPress Ctrl+C once to stop local servers.");

  if (children.length) await stopped;
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));

start().catch((error) => {
  console.error(`\nLocal startup failed: ${error.message}`);
  process.exitCode = 1;
  stopChildren();
});
