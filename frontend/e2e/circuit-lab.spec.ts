import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SimulationRequest, SimulationResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
let backendLog = '';

async function stopBackend() {
  const child = backend;
  backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(deadline);
  }
}

async function startBackend() {
  // Each spec owns its process; never reuse or stop a developer's server.
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve()));
  });
  backendLog = '';
  backend = spawn(
    fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    {
      cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
      env: { ...process.env, QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  backend.stdout?.on('data', (chunk: Buffer) => { backendLog += chunk.toString(); });
  backend.stderr?.on('data', (chunk: Buffer) => { backendLog += chunk.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(`Backend exited during startup: ${backendLog}`);
    try {
      const response = await fetch('http://127.0.0.1:8001/api/health', { signal: AbortSignal.timeout(1000) });
      return response.status;
    } catch {
      return 0;
    }
  }, { timeout: 15_000 }).toBe(200);
}

const blank: SimulationRequest = {
  numQubits: 2, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42,
};
const bellGates = [
  { type: 'h', targets: [0], controls: [] },
  { type: 'cx', targets: [1], controls: [0] },
];

function withoutGateIds(request: SimulationRequest) {
  const ids = request.gates.map((gate) => gate.id);
  expect(new Set(ids).size).toBe(ids.length);
  return {
    ...request,
    // Preserve gate order and every other field, including unexpected fields.
    gates: request.gates.map(({ id, ...gate }) => {
      expect(typeof id).toBe('string');
      expect(id.trim().length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(64);
      return gate;
    }),
  };
}

async function openDetails(page: Page) {
  const details = page.getByRole('region', { name: 'Lab simulation results', exact: true }).locator('details');
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').filter({ hasText: /^Details$/ }).click();
  }
  await expect(page.getByLabel('Current request JSON', { exact: true })).toBeVisible();
}

async function currentRequest(page: Page): Promise<SimulationRequest> {
  await openDetails(page);
  return JSON.parse(await page.getByLabel('Current request JSON', { exact: true }).innerText()) as SimulationRequest;
}

async function expectRequest(page: Page, expected: SimulationRequest) {
  await expect.poll(() => currentRequest(page)).toEqual(expected);
}

async function expectStatus(page: Page, status: 'Idle' | 'Current' | 'Stale' | 'Error') {
  await expect(page.getByRole('status').filter({ hasText: new RegExp(`^${status}$`) })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Results are stale' })).toHaveCount(status === 'Stale' ? 1 : 0);
}

async function run(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/simulate') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run Simulation', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const request = response.request().postDataJSON() as SimulationRequest;
  const body = await response.json() as SimulationResponse;
  expect(body.backend).toBe('qiskit');
  expect(body.numQubits).toBe(request.numQubits);
  expect(body.shots).toBe(request.shots);
  expect(Object.values(body.counts).reduce((sum, count) => sum + count, 0)).toBe(request.shots);
  await expectStatus(page, 'Current');
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
  return { request, body };
}

async function visualBell(page: Page) {
  await page.getByRole('button', { name: 'Choose H gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q0 at step 1', exact: true }).click();
  await page.getByRole('button', { name: 'Choose CX gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q0 at step 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Control:' })).toContainText('step 2');
  await page.getByRole('button', { name: 'Place gate on q1 at step 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel CX', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

// Both specs own port 8001, leaving the developer's backend on 8000 untouched.
test.describe.configure({ mode: 'serial' });
test.beforeAll(startBackend);
test.afterAll(stopBackend);
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Circuit Lab', exact: true })).toBeVisible();
});

test('blank default becomes a visual Bell circuit with an ordered real POST and Aer results', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expectRequest(page, blank);
  await expectStatus(page, 'Idle');
  await expect(page.getByRole('heading', { name: 'No simulation results yet', exact: true })).toBeVisible();
  await expect(page.getByTestId(/^lab-probability-/)).toHaveCount(0);
  for (const name of ['Undo', 'Redo', 'Reset']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('link', { name: 'Circuit Test ↗', exact: true })).toHaveAttribute('href', '/circuit-test');

  await visualBell(page);
  const canonical = await currentRequest(page);
  expect(withoutGateIds(canonical)).toEqual({ ...blank, gates: bellGates });
  const cx = canonical.gates.find((gate) => gate.type === 'cx');
  expect(cx).toBeDefined();
  const connector = page.getByTestId(`cx-connector-${cx!.id}`);
  await expect(connector).toBeVisible();
  const { request, body } = await run(page);
  expect(request).toEqual(canonical);
  expect(withoutGateIds(request)).toEqual({ ...blank, gates: bellGates });
  expect(body.metadata).toMatchObject({
    method: 'statevector', measurement: 'terminal-all', statevectorStage: 'before-measurement',
    bitOrder: 'q[n-1]...q[0]', seedSimulator: 42, gateCount: 2,
  });
  expect(body.metadata.aerVersion).not.toBe('');
  expect(Object.keys(body.probabilities).sort()).toEqual(['00', '01', '10', '11']);
  expect(Object.keys(body.counts).sort()).toEqual(['00', '01', '10', '11']);
  for (const [label, probability] of Object.entries({ '00': 0.5, '01': 0, '10': 0, '11': 0.5 })) {
    expect(body.probabilities[label]).toBeCloseTo(probability, 12);
    await expect(page.getByTestId(`lab-probability-${label}`)).toContainText(`|${label}⟩`);
    await expect(page.getByTestId(`lab-probability-${label}`)).toContainText(`${probability.toFixed(4)} (${(probability * 100).toFixed(4)}%)`);
  }
  expect(body.counts['01']).toBe(0);
  expect(body.counts['10']).toBe(0);
  for (const label of ['00', '11']) {
    expect(Math.abs(body.counts[label]! / 1024 - 0.5)).toBeLessThan(0.08);
  }
  expect(body.statevector).toHaveLength(4);
  for (const [index, amplitude] of body.statevector.entries()) {
    expect(amplitude.real).toBeCloseTo(index === 0 || index === 3 ? Math.SQRT1_2 : 0, 12);
    expect(amplitude.imag).toBeCloseTo(0, 12);
  }
  await page.getByRole('tab', { name: 'Sampled counts', exact: true }).click();
  for (const [label, count] of Object.entries(body.counts)) {
    await expect(page.getByTestId(`lab-count-${label}`)).toContainText(`|${label}⟩`);
    await expect(page.getByTestId(`lab-count-${label}`)).toContainText(count.toLocaleString());
  }
  await page.getByRole('tab', { name: 'Statevector', exact: true }).click();
  const amplitudes = page.getByRole('region', { name: 'Statevector amplitudes', exact: true });
  await expect(amplitudes.getByRole('row')).toHaveCount(5);
  await expect(amplitudes.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '|11⟩', exact: true }) }).getByRole('cell')).toHaveText(['0.7071', '0.0000']);
  await page.getByRole('tab', { name: 'Ideal probabilities', exact: true }).click();
  await openDetails(page);
  expect(JSON.parse(await page.getByLabel('Result snapshot request JSON', { exact: true }).innerText())).toEqual(request);
  expect(JSON.parse(await page.getByLabel('Result snapshot response JSON', { exact: true }).innerText())).toEqual(body);
  await page.locator('summary').filter({ hasText: /^Details$/ }).click();
  await expectNoPageOverflow(page);
  await testInfo.attach('visual-bell-request.json', { body: JSON.stringify(request, null, 2), contentType: 'application/json' });
  await testInfo.attach('real-aer-bell-response.json', { body: JSON.stringify(body, null, 2), contentType: 'application/json' });
  await testInfo.attach('visual-bell-desktop.png', { body: await page.screenshot({ path: testInfo.outputPath('visual-bell-desktop.png'), fullPage: true }), contentType: 'image/png' });

  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: 'Workspace panels', exact: true });
  await expect(nav.getByRole('button', { name: 'Results', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-probability-11')).toBeVisible();
  await expectNoPageOverflow(page);
  await testInfo.attach('visual-bell-mobile-results.png', { body: await page.screenshot({ path: testInfo.outputPath('visual-bell-mobile-results.png'), fullPage: true }), contentType: 'image/png' });
  await nav.getByRole('button', { name: 'Circuit', exact: true }).click();
  await expect(connector).toBeVisible();
  await expectNoPageOverflow(page);
  await testInfo.attach('visual-bell-mobile-circuit.png', { body: await page.screenshot({ path: testInfo.outputPath('visual-bell-mobile-circuit.png'), fullPage: true }), contentType: 'image/png' });

  // Reapplying CX can reorder object properties without changing the circuit.
  await page.getByRole('button', { name: 'Select CX target q1 at step 2', exact: true }).click();
  await page.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  await nav.getByRole('button', { name: 'Results', exact: true }).click();
  await expectRequest(page, canonical);
  await expectStatus(page, 'Current');
  expect(JSON.parse(await page.getByLabel('Result snapshot request JSON', { exact: true }).innerText())).toEqual(canonical);
  expect(JSON.parse(await page.getByLabel('Result snapshot response JSON', { exact: true }).innerText())).toEqual(body);
  expect(errors).toEqual([]);
  console.log('Observed visual Bell request:', JSON.stringify(request));
  console.log('Observed real Aer visual Bell response:', JSON.stringify(body));
});

test('selected gate drafts, click-based insertion, reorder, delete and reset preserve undo/redo snapshots', async ({ page }) => {
  await page.getByRole('button', { name: 'Choose H gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q0 at step 1', exact: true }).click();
  const original = await currentRequest(page);
  const id = original.gates[0]!.id;
  await page.getByRole('button', { name: 'Select H gate at step 1', exact: true }).click();
  await page.getByLabel('Gate type', { exact: true }).selectOption('cx');
  await expect(page.getByRole('button', { name: 'Apply gate changes', exact: true })).toBeDisabled();
  await page.getByLabel('Control qubit', { exact: true }).selectOption('1');
  await page.getByLabel('Target qubit', { exact: true }).selectOption('0');
  await expectRequest(page, original);
  await page.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  const edited: SimulationRequest = { ...blank, gates: [{ id, type: 'cx', controls: [1], targets: [0] }] };
  await expectRequest(page, edited);
  await expect(page.getByTestId(`cx-connector-${id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectRequest(page, edited);

  await page.getByRole('button', { name: 'Done · place gates', exact: true }).click();
  await page.getByText('Add gate with form', { exact: true }).click();
  await page.getByLabel('Gate type', { exact: true }).selectOption('z');
  await page.getByLabel('Target qubit', { exact: true }).selectOption('1');
  await page.getByLabel('Insert position', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Add gate', exact: true }).click();
  const inserted = await currentRequest(page);
  expect(withoutGateIds(inserted)).toEqual({ ...blank, gates: [
    { type: 'z', targets: [1], controls: [] }, { type: 'cx', targets: [0], controls: [1] },
  ] });
  expect(inserted.gates[1]!.id).toBe(id);
  await expect(page.getByRole('button', { name: 'Move gate earlier', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move gate later', exact: true }).click();
  await expectRequest(page, { ...inserted, gates: [inserted.gates[1]!, inserted.gates[0]!] });
  await expect(page.getByRole('button', { name: 'Move gate later', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move gate earlier', exact: true }).click();
  await expectRequest(page, inserted);
  await page.getByRole('button', { name: 'Delete gate', exact: true }).click();
  await expectRequest(page, edited);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, inserted);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectRequest(page, edited);

  await page.getByRole('button', { name: 'Add qubit', exact: true }).click();
  await page.getByLabel('Shots', { exact: true }).fill('2048');
  await page.getByRole('button', { name: 'Apply shots', exact: true }).click();
  const beforeReset: SimulationRequest = { ...edited, numQubits: 3, shots: 2048 };
  await expectRequest(page, beforeReset);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expectRequest(page, blank);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, beforeReset);
  await expect(page.getByLabel('Shots', { exact: true })).toHaveValue('2048');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectRequest(page, blank);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Choose X gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q0 at step 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});

test('qubit and shot limits protect the canonical request and unapplied shots disable Run', async ({ page }) => {
  await page.getByRole('button', { name: 'Remove qubit', exact: true }).click();
  await expectRequest(page, { ...blank, numQubits: 1 });
  await expect(page.getByRole('button', { name: 'Remove qubit', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose CX gate', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add qubit', exact: true }).click();
  await page.getByRole('button', { name: 'Add qubit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add qubit', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Choose X gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q2 at step 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove qubit', exact: true })).toBeDisabled();
  await expect(page.getByText('To remove q2, first move or delete its gates.', { exact: true })).toBeVisible();
  await page.getByLabel('Target qubit', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove qubit', exact: true })).toBeEnabled();
  await page.getByLabel('Gate type', { exact: true }).selectOption('cx');
  await page.getByLabel('Control qubit', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove qubit', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Delete gate', exact: true }).click();
  await page.getByRole('button', { name: 'Remove qubit', exact: true }).click();
  await expectRequest(page, blank);

  for (const value of ['', '0', '8193', '1.5']) {
    await page.getByLabel('Shots', { exact: true }).fill(value);
    await expect(page.getByLabel('Shots', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Apply shots', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
    await expectRequest(page, blank);
  }
  for (const shots of [1, 8192]) {
    const previous = await currentRequest(page);
    await page.getByLabel('Shots', { exact: true }).fill(String(shots));
    await expect(page.getByLabel('Shots', { exact: true })).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
    await expectRequest(page, previous);
    await page.getByRole('button', { name: 'Apply shots', exact: true }).click();
    await expectRequest(page, { ...blank, shots });
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Apply shots', exact: true })).toBeDisabled();
  }
  const { request, body } = await run(page);
  expect(request).toEqual({ ...blank, shots: 8192 });
  expect(body.counts['00']).toBe(8192);
});

test('Load template replaces the canonical circuit and remains undoable, including the one-qubit empty template', async ({ page }) => {
  const cases: Array<{ id: string; request: SimulationRequest }> = [
    { id: 'empty', request: { ...blank, numQubits: 1 } },
    { id: 'x', request: { ...blank, numQubits: 1, gates: [{ id: 'g1', type: 'x', targets: [0], controls: [] }] } },
    { id: 'h', request: { ...blank, numQubits: 1, gates: [{ id: 'g1', type: 'h', targets: [0], controls: [] }] } },
    { id: 'hh', request: { ...blank, numQubits: 1, gates: [
      { id: 'g1', type: 'h', targets: [0], controls: [] }, { id: 'g2', type: 'h', targets: [0], controls: [] },
    ] } },
    { id: 'bell', request: { ...blank, gates: [
      { id: 'g1', type: 'h', targets: [0], controls: [] }, { id: 'g2', type: 'cx', targets: [1], controls: [0] },
    ] } },
  ];
  for (const sample of cases) {
    const previous = await currentRequest(page);
    await page.getByLabel('Load template', { exact: true }).selectOption(sample.id);
    await expectRequest(page, sample.request);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expectRequest(page, previous);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expectRequest(page, sample.request);
  }
  await page.getByRole('button', { name: 'Choose X gate', exact: true }).click();
  await page.getByRole('button', { name: 'Place gate on q1 at step 3', exact: true }).click();
  const appended = await currentRequest(page);
  expect(withoutGateIds(appended)).toEqual({ ...blank, gates: [...bellGates, { type: 'x', targets: [1], controls: [] }] });
  const { request } = await run(page);
  expect(request).toEqual(appended);
});

test('results track canonical gate, shot and qubit edits, not selected-form drafts; undo restores currentness', async ({ page }) => {
  await visualBell(page);
  const original = await currentRequest(page);
  await run(page);
  await page.getByRole('button', { name: 'Select H gate at step 1', exact: true }).click();
  await page.getByLabel('Gate type', { exact: true }).selectOption('x');
  await expectRequest(page, original);
  await expectStatus(page, 'Current');
  expect((await run(page)).request).toEqual(original);
  await page.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  await expectStatus(page, 'Stale');
  await expect(page.getByTestId('lab-probability-00')).toContainText('0.5000');
  expect(JSON.parse(await page.getByLabel('Result snapshot request JSON', { exact: true }).innerText())).toEqual(original);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, original);
  await expectStatus(page, 'Current');

  await page.getByLabel('Shots', { exact: true }).fill('2048');
  await expectStatus(page, 'Current');
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Apply shots', exact: true }).click();
  await expectStatus(page, 'Stale');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, original);
  await expect(page.getByLabel('Shots', { exact: true })).toHaveValue('1024');
  await expectStatus(page, 'Current');

  await page.getByRole('button', { name: 'Add qubit', exact: true }).click();
  await expectStatus(page, 'Stale');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, original);
  await expectStatus(page, 'Current');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const updated = await currentRequest(page);
  expect(updated).toEqual({ ...original, numQubits: 3 });
  const { request, body } = await run(page);
  expect(request).toEqual(updated);
  expect(body.probabilities['000']).toBeCloseTo(0.5, 12);
  expect(body.probabilities['011']).toBeCloseTo(0.5, 12);
  await expect(page.getByTestId('lab-probability-011')).toContainText('0.5000');
  await expect(page.getByTestId('lab-probability-11')).toHaveCount(0);
  expect(JSON.parse(await page.getByLabel('Result snapshot request JSON', { exact: true }).innerText())).toEqual(updated);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expectStatus(page, 'Stale');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, updated);
  await expectStatus(page, 'Current');
});

test('editing during a gated real request keeps its completed snapshot stale until a new run', async ({ page }) => {
  await visualBell(page);
  const original = await currentRequest(page);
  await run(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sent: SimulationRequest[] = [];
  await page.route('**/api/simulate', async (route) => {
    sent.push(route.request().postDataJSON() as SimulationRequest);
    await gate;
    await route.continue(); // Delay only the request; FastAPI and Aer still produce the real response.
  });
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/simulate') && response.request().method() === 'POST',
  );
  try {
    await page.getByRole('button', { name: 'Run Simulation', exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual(original);
    await expect(page.getByRole('status').filter({ hasText: 'Running simulation…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Load template', { exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Choose X gate', exact: true }).click();
    await page.getByRole('button', { name: 'Place gate on q0 at step 3', exact: true }).click();
    await page.getByLabel('Shots', { exact: true }).fill('2048');
    await page.getByRole('button', { name: 'Apply shots', exact: true }).click();
    await page.getByRole('button', { name: 'Add qubit', exact: true }).click();
    await expectStatus(page, 'Stale');
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
    expect(sent).toEqual([original]);
  } finally {
    release();
  }
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json() as SimulationResponse;
  expect(response.request().postDataJSON()).toEqual(original);
  expect(body.numQubits).toBe(2);
  expect(body.shots).toBe(1024);
  expect(Object.values(body.counts).reduce((sum, count) => sum + count, 0)).toBe(1024);
  expect(body.probabilities['00']).toBeCloseTo(0.5, 12);
  expect(body.probabilities['11']).toBeCloseTo(0.5, 12);
  await expect(page.getByRole('status').filter({ hasText: 'Running simulation…' })).toHaveCount(0);
  await expectStatus(page, 'Stale');
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
  const edited = await currentRequest(page);
  expect(withoutGateIds(edited)).toEqual({ ...blank, numQubits: 3, shots: 2048, gates: [
    ...bellGates, { type: 'x', targets: [0], controls: [] },
  ] });
  expect(JSON.parse(await page.getByLabel('Result snapshot request JSON', { exact: true }).innerText())).toEqual(original);
  expect(JSON.parse(await page.getByLabel('Result snapshot response JSON', { exact: true }).innerText())).toEqual(body);
  await expect(page.getByTestId('lab-probability-00')).toContainText('0.5000');
  expect(sent).toHaveLength(1);
  await page.unroute('**/api/simulate');
  const updated = await run(page);
  expect(updated.request).toEqual(edited);
  expect(updated.body.probabilities['001']).toBeCloseTo(0.5, 12);
  expect(updated.body.probabilities['010']).toBeCloseTo(0.5, 12);
  await expect(page.getByTestId('lab-probability-001')).toContainText('0.5000');
});

test('palette and canvas support keyboard activation, invalid CX feedback and Escape cancellation', async ({ page }) => {
  const h = page.getByRole('button', { name: 'Choose H gate', exact: true });
  await h.focus();
  await expect(h).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(h).toHaveAttribute('aria-pressed', 'true');
  const firstCell = page.getByRole('button', { name: 'Place gate on q0 at step 1', exact: true });
  await firstCell.focus();
  await expect(firstCell).toBeFocused();
  await page.keyboard.press('Space');
  const oneGate = await currentRequest(page);
  expect(withoutGateIds(oneGate)).toEqual({ ...blank, gates: [bellGates[0]] });
  const cx = page.getByRole('button', { name: 'Choose CX gate', exact: true });
  await cx.focus();
  await page.keyboard.press('Space');
  await expect(cx).toHaveAttribute('aria-pressed', 'true');
  const control = page.getByRole('button', { name: 'Place gate on q0 at step 2', exact: true });
  await control.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Choose a different target qubit in the same step as the control.');
  await expectRequest(page, oneGate);
  await page.getByRole('button', { name: 'Place gate on q1 at step 1', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a different target qubit in the same step as the control.');
  await expectRequest(page, oneGate);
  const grid = page.getByRole('region', { name: 'Circuit grid, execution left to right', exact: true });
  await grid.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cancel CX', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
  await control.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Place gate on q1 at step 2', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  expect(withoutGateIds(await currentRequest(page))).toEqual({ ...blank, gates: bellGates });
  const target = page.getByRole('button', { name: 'Select CX target q1 at step 2', exact: true });
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Control qubit', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Target qubit', { exact: true })).toHaveValue('1');
  await run(page);
  const probabilities = page.getByRole('tab', { name: 'Ideal probabilities', exact: true });
  await probabilities.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Sampled counts', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Sampled counts', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Statevector', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(probabilities).toBeFocused();
  await expect(probabilities).toHaveAttribute('aria-selected', 'true');
});

for (const width of [1000, 390]) {
  test(`mobile workspace at ${width}px uses pressed panel buttons and explicit tool-to-circuit navigation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const nav = page.getByRole('navigation', { name: 'Workspace panels', exact: true });
    const settings = nav.getByRole('button', { name: 'Gates & settings', exact: true });
    const circuit = nav.getByRole('button', { name: 'Circuit', exact: true });
    const results = nav.getByRole('button', { name: 'Results', exact: true });
    const grid = page.getByRole('region', { name: 'Circuit grid, execution left to right', exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button')).toHaveCount(3);
    await expect(nav.getByRole('tab')).toHaveCount(0);
    await expect(circuit).toHaveAttribute('aria-pressed', 'true');
    await expect(settings).toHaveAttribute('aria-pressed', 'false');
    await expect(results).toHaveAttribute('aria-pressed', 'false');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gate library', exact: true })).toBeVisible();
    await settings.click();
    await page.getByRole('button', { name: 'Choose H gate', exact: true }).click();
    await expect(settings).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toBeHidden();
    await circuit.click();
    await page.getByRole('button', { name: 'Place gate on q0 at step 1', exact: true }).click();
    await settings.click();
    await page.getByRole('button', { name: 'Choose CX gate', exact: true }).click();
    await expect(settings).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toBeHidden();
    await circuit.click();
    await page.getByRole('button', { name: 'Place gate on q0 at step 2', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Place gate on q1 at step 2', exact: true }).click();
    await page.getByRole('button', { name: 'Select CX target q1 at step 2', exact: true }).click();
    await expect(circuit).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selected gate', exact: true })).toBeVisible();
    await expect(page.getByLabel('Control qubit', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Target qubit', { exact: true })).toHaveValue('1');
    await expectNoPageOverflow(page);
    await circuit.click();
    const { request, body } = await run(page);
    expect(withoutGateIds(request)).toEqual({ ...blank, gates: bellGates });
    expect(body.probabilities['11']).toBeCloseTo(0.5, 12);
    await expect(results).toHaveAttribute('aria-pressed', 'true');
    await expect(circuit).toHaveAttribute('aria-pressed', 'false');
    await expect(grid).toBeHidden();
    await expect(page.getByTestId('lab-probability-11')).toContainText('0.5000');
    await expectRequest(page, request);
    await expectNoPageOverflow(page);
    await testInfo.attach(`workspace-${width}-results.png`, { body: await page.screenshot({ path: testInfo.outputPath(`workspace-${width}-results.png`), fullPage: true }), contentType: 'image/png' });
    await circuit.click();
    await expect(page.getByTestId(`cx-connector-${request.gates[1]!.id}`)).toBeVisible();
    await expectNoPageOverflow(page);
  });
}

test('contextual inspector edits and deletes on a narrow screen, with explicit and keyboard deselection', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByLabel('Load template', { exact: true }).selectOption('bell');
  const inspector = page.getByRole('region', { name: 'Selected gate inspector', exact: true });
  const grid = page.getByRole('region', { name: 'Circuit grid, execution left to right', exact: true });
  const target = page.getByRole('button', { name: 'Select CX target q1 at step 2', exact: true });
  await target.click();
  await expect(grid).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose H gate', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await inspector.getByLabel('Control qubit', { exact: true }).selectOption('1');
  await expect(inspector.getByRole('button', { name: 'Apply gate changes', exact: true })).toBeDisabled();
  await inspector.getByLabel('Target qubit', { exact: true }).selectOption('0');
  await inspector.getByRole('button', { name: 'Apply gate changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select CX control q1 at step 2', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Move gate earlier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select CX target q0 at step 1', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Delete gate', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  await expect(grid).toBeFocused();
  await expect(page.getByRole('button', { name: 'Select H gate at step 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Select CX target q0 at step 1', exact: true }).click();
  await inspector.getByLabel('Gate type', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(grid).toBeFocused();
  await expect(page.getByRole('button', { name: 'Choose H gate', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select H gate at step 2', exact: true }).click();
  await inspector.getByRole('button', { name: 'Done · place gates', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByLabel('Gate type', { exact: true })).toBeHidden();
  await page.getByText('Add gate with form', { exact: true }).click();
  await expect(page.getByLabel('Insert position', { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await testInfo.attach('narrow-form.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('native palette dragging inserts H X Z, rejects occupied cells, and builds a real Bell circuit with CX', async ({ page }) => {
  const palette = (type: string) => page.getByRole('button', { name: `Choose ${type} gate`, exact: true });
  const cell = (q: number, step: number) => page.getByRole('button', { name: `Place gate on q${q} at step ${step}`, exact: true });
  await palette('H').dragTo(cell(0, 1));
  const first = await currentRequest(page);
  expect(withoutGateIds(first)).toEqual({ ...blank, gates: [bellGates[0]] });
  await palette('X').dragTo(page.getByRole('button', { name: 'Select H gate at step 1', exact: true }));
  await expectRequest(page, first);
  await palette('X').dragTo(cell(1, 1));
  await palette('Z').dragTo(cell(0, 3));
  const three = await currentRequest(page);
  expect(withoutGateIds(three)).toEqual({ ...blank, gates: [
    { type: 'x', targets: [1], controls: [] }, bellGates[0], { type: 'z', targets: [0], controls: [] },
  ] });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectRequest(page, first);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectRequest(page, three);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await palette('CX').dragTo(cell(0, 2));
  await expectRequest(page, first); // A drop supplies only the control, never a partial CX.
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel CX', exact: true }).click();
  await expectRequest(page, first);
  await palette('CX').dragTo(cell(0, 2));
  await cell(1, 2).click();
  const { request, body } = await run(page);
  expect(withoutGateIds(request)).toEqual({ ...blank, gates: bellGates });
  expect(body.probabilities['00']).toBeCloseTo(0.5, 12);
  expect(body.probabilities['11']).toBeCloseTo(0.5, 12);
  await expect(page.getByTestId('lab-probability-00')).toContainText('50.0000%');
  await expect(page.getByTestId('lab-probability-11')).toContainText('50.0000%');
});

// Must remain last: the failure is produced by stopping only this file's owned backend.
test('an actual backend outage reports an alert and removes the previous probability results', async ({ page }, testInfo) => {
  await visualBell(page);
  await run(page);
  await expect(page.getByTestId('lab-probability-00')).toBeVisible();
  await stopBackend();
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/simulate') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run Simulation', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBeGreaterThanOrEqual(500);
  await expect(page.getByRole('alert')).toContainText('Simulation could not complete');
  await expect(page.getByRole('alert')).toContainText('API unavailable');
  await expect(page.getByRole('alert')).toContainText('FastAPI');
  await expectStatus(page, 'Error');
  await expect(page.getByTestId(/^lab-probability-/)).toHaveCount(0);
  await expect(page.getByTestId(/^lab-count-/)).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Result views', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No simulation results yet', exact: true })).toBeVisible();
  await expect(page.getByLabel('Result snapshot response JSON', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run Simulation', exact: true })).toBeEnabled();
  await testInfo.attach('circuit-lab-backend-unavailable.png', { body: await page.screenshot({ path: testInfo.outputPath('circuit-lab-backend-unavailable.png'), fullPage: true }), contentType: 'image/png' });
});
