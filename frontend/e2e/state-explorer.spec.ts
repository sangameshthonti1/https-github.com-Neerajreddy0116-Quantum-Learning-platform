import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SimulationRequest, TraceResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
async function stopBackend() {
  const child = backend;
  backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
}
async function startBackend() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve()));
  });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
      env: { ...process.env, QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(log);
    try { return (await fetch('http://127.0.0.1:8001/api/health')).status; } catch { return 0; }
  }).toBe(200);
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function bell(page: Page) {
  await button(page, 'Choose H gate').click();
  await button(page, 'Place gate on q0 at step 1').click();
  await button(page, 'Choose CX gate').click();
  await button(page, 'Place gate on q0 at step 2').click();
  await button(page, 'Place gate on q1 at step 2').click();
}
async function explore(page: Page) {
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/simulate/trace') && r.request().method() === 'POST');
  await button(page, 'Explore steps').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json() as TraceResponse;
  await expect(page.getByRole('status').filter({ hasText: /^Step 0 of/ })).toBeVisible();
  return { request: response.request().postDataJSON() as SimulationRequest, body };
}
async function rawTrace(page: Page) {
  const details = page.getByRole('region', { name: 'State Explorer', exact: true }).locator('details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return JSON.parse(await page.getByLabel('Trace response JSON', { exact: true }).innerText()) as TraceResponse;
}
async function probability(page: Page, basis: string, percent: number) {
  await expect(page.getByTestId(`trace-probability-${basis}`)).toContainText(`${percent.toFixed(4)}%`);
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(startBackend);
test.afterAll(stopBackend);
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Circuit Lab', exact: true })).toBeVisible();
});

test('empty trace uses the canonical request, initial state and real Bloch vectors', async ({ page }) => {
  await button(page, 'State Explorer').click();
  await expect(page.getByText('Trace the circuit to inspect its initial state and every gate’s effect.', { exact: true })).toBeVisible();
  const { request, body } = await explore(page);
  expect(request).toEqual({ numQubits: 2, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42 });
  expect(body.steps).toHaveLength(1);
  expect(body.steps[0]!.gate).toBeNull();
  await probability(page, '00', 100);
  await probability(page, '11', 0);
  await expect(button(page, 'Previous step')).toBeDisabled();
  await expect(button(page, 'Next step')).toBeDisabled();
  await expect(page.getByLabel('Trace step', { exact: true })).toBeDisabled();
  await expect(page.locator('.circuit-wire-labels[data-trace="true"]')).toContainText('Initial · 0');
  await expect(page.getByTestId('bloch-values-q0')).toContainText('(0.0000, 0.0000, 1.0000)');
  expect(await rawTrace(page)).toEqual(body);
});

test('visual Bell trace navigates all three states, highlights gates and shows mixed qubits at the center', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bell(page);
  const { request, body } = await explore(page);
  expect(request.gates.map(({ id, ...g }) => { expect(id).toBeTruthy(); return g; })).toEqual([
    { type: 'h', targets: [0], controls: [] }, { type: 'cx', targets: [1], controls: [0] },
  ]);
  expect(body.steps).toHaveLength(3);
  await probability(page, '00', 100);
  await button(page, 'Next step').click();
  await probability(page, '00', 50);
  await probability(page, '01', 50);
  await probability(page, '11', 0);
  await expect(page.locator('.circuit-column[data-trace="true"]')).toHaveAttribute('data-gate-id', request.gates[0]!.id);
  await expect(page.getByTestId('bloch-values-q0')).toContainText('(1.0000, 0.0000, 0.0000)');
  await expect(page.getByTestId('trace-explanation')).toContainText('H on q0');
  await page.getByText('Rotate view', { exact: true }).click();
  const point = await page.getByTestId('bloch-endpoint').getAttribute('cx');
  await page.getByLabel('Sphere azimuth', { exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('bloch-endpoint')).not.toHaveAttribute('cx', point!);
  await button(page, 'Reset view').click();
  await button(page, 'Trace step 2: CX q0 → q1').click();
  await probability(page, '00', 50);
  await probability(page, '01', 0);
  await probability(page, '10', 0);
  await probability(page, '11', 50);
  await expect(page.locator('.circuit-column[data-trace="true"]')).toHaveAttribute('data-gate-id', request.gates[1]!.id);
  for (const q of [0, 1]) {
    await button(page, `Inspect q${q}`).click();
    await expect(page.getByTestId(`bloch-values-q${q}`)).toContainText('(0.0000, 0.0000, 0.0000)');
    await expect(page.getByTestId(`bloch-values-q${q}`)).toContainText('0.5000');
    await expect(page.getByTestId('bloch-endpoint')).toHaveAttribute('cx', '140');
    await expect(page.getByTestId('bloch-endpoint')).toHaveAttribute('cy', '140');
    expect(body.steps[2]!.qubits[q]!.blochVector).toMatchObject({ x: 0, z: 0 });
  }
  await button(page, 'Step statevector').click();
  const rows = page.getByRole('region', { name: 'Trace statevector amplitudes', exact: true }).getByRole('row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['0.7071', '0.0000']);
  await expect(rows.nth(4).getByRole('cell')).toHaveText(['0.7071', '0.0000']);
  await page.getByLabel('Trace step', { exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('status').filter({ hasText: /^Step 0 of/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status').filter({ hasText: /^Step 1 of/ })).toBeVisible();
  await page.keyboard.press('End');
  await expect(button(page, 'Next step')).toBeDisabled();
  expect(await rawTrace(page)).toEqual(body);
  await testInfo.attach('bell-trace.json', { body: JSON.stringify({ request, body }, null, 2), contentType: 'application/json' });
  console.log('Browser Bell trace:', JSON.stringify(body));
  expect(errors).toEqual([]);
});

test('H followed by H shows superposition then returns to zero and retains final simulation results', async ({ page }) => {
  await page.getByLabel('Load template', { exact: true }).selectOption('hh');
  await button(page, 'Run Simulation').click();
  await expect(page.getByTestId('lab-probability-0')).toContainText('100.0000%');
  const { body } = await explore(page);
  expect(body.steps).toHaveLength(3);
  await button(page, 'Next step').click();
  await probability(page, '0', 50);
  await probability(page, '1', 50);
  await button(page, 'Next step').click();
  await probability(page, '0', 100);
  await probability(page, '1', 0);
  await button(page, 'View final simulation results').click();
  await expect(page.getByTestId('lab-probability-0')).toContainText('100.0000%');
  await page.getByRole('tab', { name: 'Sampled counts', exact: true }).click();
  await expect(page.getByTestId('lab-count-0')).toContainText('1,024');
  await button(page, 'State Explorer').click();
  await probability(page, '0', 100);
});

test('gate, shots and qubit edits invalidate snapshots and highlights; undo restores exact current trace', async ({ page }) => {
  await bell(page);
  const { request, body } = await explore(page);
  await button(page, 'Next step').click();
  await page.getByLabel('Shots', { exact: true }).fill('2048');
  await expect(button(page, 'Trace circuit')).toBeDisabled();
  await button(page, 'Apply shots').click();
  await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toBeVisible();
  await expect(page.getByTestId(/^trace-probability-/)).toHaveCount(0);
  await expect(page.locator('[data-trace="true"]')).toHaveCount(0);
  expect(await rawTrace(page)).toEqual(body);
  expect(JSON.parse(await page.getByLabel('Trace request JSON', { exact: true }).innerText())).toEqual(request);
  await button(page, 'Undo').click();
  await probability(page, '01', 50);
  await button(page, 'Add qubit').click();
  await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toBeVisible();
  await button(page, 'Undo').click();
  await button(page, 'Select H gate at step 1').click();
  await page.getByLabel('Gate type', { exact: true }).selectOption('x');
  await button(page, 'Apply gate changes').click();
  await button(page, 'State Explorer').click();
  await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toBeVisible();
  await expect(page.getByTestId('bloch-endpoint')).toHaveCount(0);
  await explore(page);
  await button(page, 'Trace step 2: CX q0 → q1').click();
  await probability(page, '11', 100);
});

test('editing during an in-flight request cancels it and a late old response cannot overwrite a newer trace', async ({ page }) => {
  await bell(page);
  let release: () => void = () => {};
  let handled: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const completed = new Promise<void>((resolve) => { handled = resolve; });
  let count = 0;
  let oldReady = false;
  await page.route('**/api/simulate/trace', async (route) => {
    count += 1;
    if (count !== 1) { await route.continue(); return; }
    const actual = await route.fetch(); // Real backend response, held only for race testing.
    oldReady = true;
    await gate;
    try { await route.fulfill({ response: actual }); } catch { /* The old browser request was aborted. */ }
    finally { handled(); }
  });
  try {
    await button(page, 'Explore steps').click();
    await expect.poll(() => oldReady).toBe(true);
    await expect(button(page, 'Explore steps')).toBeDisabled();
    await page.getByLabel('Shots', { exact: true }).fill('2048');
    await button(page, 'Apply shots').click();
    await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toContainText('during tracing');
    await expect(page.getByTestId(/^trace-probability-/)).toHaveCount(0);
    const next = await explore(page);
    expect(next.request.shots).toBe(2048);
    release(); await completed;
    expect(await rawTrace(page)).toEqual(next.body);
    expect(JSON.parse(await page.getByLabel('Trace request JSON', { exact: true }).innerText()).shots).toBe(2048);
    expect(count).toBe(2);
  } finally { release(); }
});

test('real backend validation errors clear trace data and retry recovers', async ({ page }) => {
  await bell(page); await explore(page);
  await page.route('**/api/simulate/trace', async (route) => {
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), shots: 0 }) });
  });
  const pending = page.waitForResponse('**/api/simulate/trace');
  await button(page, 'Trace circuit').click();
  expect((await pending).status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText('body.shots');
  await expect(page.getByTestId(/^trace-probability-/)).toHaveCount(0);
  await expect(page.getByTestId('bloch-endpoint')).toHaveCount(0);
  await expect(page.locator('[data-trace="true"]')).toHaveCount(0);
  await page.unroute('**/api/simulate/trace');
  await button(page, 'Retry trace').click();
  await probability(page, '00', 100);
});

test('malformed trace responses are rejected before rendering scientific data', async ({ page }) => {
  await page.route('**/api/simulate/trace', async (route) => {
    const response = await route.fetch();
    const body = await response.json() as TraceResponse;
    body.steps[0]!.qubits[0]!.blochVector.z = 2; // Deliberately corrupt a real response in this test only.
    await route.fulfill({ response, json: body });
  });
  await button(page, 'Explore steps').click();
  await expect(page.getByRole('alert')).toContainText('does not match the trace contract');
  await expect(page.getByTestId(/^trace-probability-/)).toHaveCount(0);
});

test('three-qubit reduced states and mobile reduced-motion navigation remain accessible', async ({ page }, testInfo) => {
  await bell(page); await button(page, 'Add qubit').click();
  await explore(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button(page, 'Trace step 2: CX q0 → q1').click();
  await probability(page, '000', 50); await probability(page, '011', 50);
  await button(page, 'Qubit sphere').click();
  await button(page, 'Inspect q2').click();
  await expect(page.getByTestId('bloch-values-q2')).toContainText('(0.0000, 0.0000, 1.0000)');
  await page.getByLabel('Trace step', { exact: true }).focus(); await page.keyboard.press('Home');
  await button(page, 'Joint state').click();
  await probability(page, '000', 100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('mobile-explorer.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

// Last: stop only this spec's owned backend to exercise a real proxy outage.
test('real backend outage removes trace state and offers retry', async ({ page }) => {
  await bell(page); await explore(page);
  await stopBackend();
  await button(page, 'Trace circuit').click();
  await expect(page.getByRole('alert')).toContainText('Trace API unavailable');
  await expect(button(page, 'Retry trace')).toBeEnabled();
  await expect(page.getByTestId(/^trace-probability-/)).toHaveCount(0);
  await expect(page.getByTestId('bloch-endpoint')).toHaveCount(0);
  await expect(page.getByLabel('Trace response JSON', { exact: true })).toHaveCount(0);
});
