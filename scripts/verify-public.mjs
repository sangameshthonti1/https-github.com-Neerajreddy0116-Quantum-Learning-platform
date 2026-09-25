#!/usr/bin/env node
// Public release gate: run against both the Render origin and the Vercel site.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const input = process.argv[2];
if (!input || !/^https:\/\//.test(input)) {
  console.error('Usage: node scripts/verify-public.mjs https://YOUR-PUBLIC-ORIGIN');
  process.exit(2);
}
const origin = new URL(input).origin;

async function request(path, body) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.text();
  assert.equal(response.status, 200, `${path}: HTTP ${response.status} ${data.slice(0, 200)}`);
  return { response, data };
}

async function json(path, body) {
  const result = await request(path, body);
  assert.match(result.response.headers.get('content-type') ?? '', /application\/json/i, path);
  return JSON.parse(result.data);
}

async function waitForHealth() {
  const deadline = Date.now() + 4 * 60_000;
  do {
    try {
      const health = await json('/api/health');
      assert.equal(health.status, 'ok');
      console.log('PASS /api/health');
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await delay(10_000);
    }
  } while (true);
}

await waitForHealth();

for (const path of ['/algorithms', '/challenges', '/lab']) {
  const { response, data } = await request(path);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i, path);
  assert.match(data, /<div id="root"><\/div>/, path);
  console.log(`PASS ${path} (SPA entry; browser interaction needs a separate check)`);
}

const algorithms = await json('/api/algorithms');
assert(algorithms.some((entry) => entry.id === 'deutsch-jozsa'));
console.log('PASS /api/algorithms');

const run = await json('/api/algorithms/run', {
  algorithm: 'deutsch-jozsa', inputQubits: 1, oracleId: 'q0',
  backend: 'qiskit', shots: 64, seedSimulator: 42,
});
assert.equal(run.interpretation.classification, 'balanced');
assert.equal(run.simulation.backend, 'qiskit');
assert.equal(run.simulation.metadata.method, 'statevector');
console.log('PASS /api/algorithms/run (real Qiskit simulation)');

const challenges = await json('/api/challenges');
assert(challenges.some((entry) => entry.id === 'flip'));
console.log('PASS /api/challenges');

const xCircuit = {
  numQubits: 1, gates: [{ id: 'smoke-x', type: 'x', targets: [0], controls: [] }],
  backend: 'qiskit', shots: 64, seedSimulator: 42,
};
const grade = await json('/api/challenges/grade', {
  challengeId: 'flip', submissionId: 'public-smoke', circuit: xCircuit,
});
assert.equal(grade.score, 100);
assert.equal(grade.targetAchieved, true);
console.log('PASS /api/challenges/grade (real simulator-backed grading)');

for (const backend of ['qiskit', 'pennylane']) {
  const result = await json('/api/simulate', { ...xCircuit, backend });
  assert.equal(result.backend, backend);
  assert.equal(result.probabilities['1'], 1);
  assert.equal(result.counts['1'], 64);
  assert.equal(typeof (backend === 'qiskit' ? result.metadata.aerVersion : result.metadata.pennylaneVersion), 'string');
  console.log(`PASS /api/simulate (${backend}, X|0⟩ = |1⟩)`);
}
console.log(`Public route and API smoke checks passed for ${origin}`);
