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
  // Never reuse or stop a developer's server. Tests own this port/process only.
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(8000, '127.0.0.1', () => probe.close(() => resolve()));
  });
  backend = spawn(
    fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8000'],
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
      const response = await fetch('http://127.0.0.1:8000/api/health', { signal: AbortSignal.timeout(1000) });
      return response.status;
    } catch {
      return 0;
    }
  }, { timeout: 15_000 }).toBe(200);
}

async function run(page: Page): Promise<SimulationResponse> {
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/simulate') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run Simulation' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json() as SimulationResponse;
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toBeVisible();
  return body;
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(startBackend);
test.afterAll(stopBackend);

test('all five templates execute through the browser against real Aer; Bell bars match the response', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Circuit Test', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toHaveCount(0);
  const skipLink = page.getByRole('link', { name: 'Skip to circuit test' });
  await expect(skipLink).toHaveCSS('opacity', '0');
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS('opacity', '1');
  await page.keyboard.press('Tab');
  await expect(skipLink).toHaveCSS('opacity', '0');

  const cases = [
    { id: 'empty', probabilities: [1, 0] },
    { id: 'x', probabilities: [0, 1] },
    { id: 'h', probabilities: [0.5, 0.5] },
    { id: 'hh', probabilities: [1, 0] },
    { id: 'bell', probabilities: [0.5, 0, 0, 0.5] },
  ];
  for (const sample of cases) {
    await page.getByLabel('Circuit template', { exact: true }).selectOption(sample.id);
    await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toHaveCount(0);
    const request = JSON.parse(await page.getByTestId('request-json').innerText()) as SimulationRequest;
    expect(request.backend).toBe('qiskit');
    const body = await run(page);
    expect(body.numQubits).toBe(request.numQubits);
    expect(Object.values(body.counts).reduce((sum, count) => sum + count, 0)).toBe(request.shots);
    for (const [index, expected] of sample.probabilities.entries()) {
      const label = index.toString(2).padStart(body.numQubits, '0');
      expect(body.probabilities[label]).toBeCloseTo(expected, 12);
      await expect(page.getByTestId(`probability-${label}`)).toContainText(`${(expected * 100).toFixed(2)}%`);
      await expect(page.getByTestId(`count-${label}`).getByRole('cell')).toHaveText(String(body.counts[label]));
    }
    if (sample.id === 'bell') {
      expect((body.counts['00'] ?? 0) / body.shots).toBeCloseTo(0.5, 1);
      expect(body.statevector[0]?.real).toBeCloseTo(Math.SQRT1_2, 12);
      expect(body.statevector[3]?.real).toBeCloseTo(Math.SQRT1_2, 12);
      console.log('Observed real Bell response:', JSON.stringify(body));
      await testInfo.attach('bell-response.json', { body: JSON.stringify(body, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('bell-state.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId('probability-11')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('bell-state-mobile.png'), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('loading prevents duplicate runs while a real request is in flight', async ({ page }) => {
  await page.goto('/');
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requestCount = 0;
  await page.route('**/api/simulate', async (route) => {
    requestCount += 1;
    await gate;
    await route.continue(); // Delays delivery only; the response still comes from real Aer.
  });
  try {
    await page.getByRole('button', { name: 'Run Simulation' }).click();
    await expect(page.getByRole('status')).toHaveText('Running simulation…');
    await expect(page.getByRole('button', { name: 'Run Simulation' })).toBeDisabled();
    await expect(page.getByLabel('Circuit template', { exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toBeVisible();
  expect(requestCount).toBe(1);
});

test('real API validation error is readable and removes previous results', async ({ page }) => {
  await page.goto('/');
  await run(page);
  await page.route('**/api/simulate', async (route) => {
    const request = route.request().postDataJSON() as SimulationRequest;
    // Send an invalid request to FastAPI; do not manufacture a validation response.
    await route.continue({ postData: JSON.stringify({ ...request, shots: 0 }) });
  });
  const responsePromise = page.waitForResponse('**/api/simulate');
  await page.getByRole('button', { name: 'Run Simulation' }).click();
  expect((await responsePromise).status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText('Request validation failed (HTTP 422)');
  await expect(page.getByRole('alert')).toContainText('body.shots');
  await expect(page.getByRole('alert')).toContainText('greater than or equal to 1');
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toHaveCount(0);
  await page.unroute('**/api/simulate');
  await run(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('stopping the owned backend produces an actual proxy failure, never stale or mock results', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Circuit template', { exact: true }).selectOption('bell');
  await run(page);
  await stopBackend();
  const responsePromise = page.waitForResponse('**/api/simulate');
  await page.getByRole('button', { name: 'Run Simulation' }).click();
  const response = await responsePromise;
  expect(response.status()).toBeGreaterThanOrEqual(500);
  await expect(page.getByRole('alert')).toContainText('API unavailable');
  await expect(page.getByRole('alert')).toContainText('FastAPI');
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run Simulation' })).toBeEnabled();
  console.log('Observed real backend outage:', response.status(), await page.getByRole('alert').innerText());
  await page.screenshot({ path: testInfo.outputPath('backend-unavailable.png'), fullPage: true });
});
