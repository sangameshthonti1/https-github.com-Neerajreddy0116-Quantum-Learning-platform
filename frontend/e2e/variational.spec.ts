import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { defaults, validDefinition, validRequest, validResult } from '../src/variational/api';
import type { Job, Result } from '../src/variational/types';

let backend: ChildProcess | undefined;
test.beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_AI_ENABLED: 'false', QLP_CORS_ORIGINS: '[]' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; backend.stderr?.on('data', (c: Buffer) => { log += c.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(log);
    try { return (await fetch('http://127.0.0.1:8001/api/health', { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; }
  }, { timeout: 15000 }).toBe(200);
});
test.afterAll(async () => {
  const child = backend;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function ready(page: Page) { await expect(page.getByRole('heading', { name: 'Generated circuit', exact: true })).toBeVisible(); }
async function predict(page: Page) {
  await ready(page);
  const radio = page.getByRole('radio', { name: 'I’m not sure yet', exact: true });
  if (await radio.isEnabled()) { await radio.check(); await button(page, 'Submit prediction').click(); }
}
async function run(page: Page): Promise<Result> {
  await predict(page);
  const started = page.waitForResponse(r => r.url().includes('/api/variational/jobs/') && r.request().method() === 'POST');
  await button(page, 'Run optimization').click();
  const response = await started; expect(response.status()).toBe(202);
  await expect(page.getByRole('region', { name: 'Variational results', exact: true })).toBeVisible({ timeout: 25000 });
  const latest = await page.request.get(response.url());
  const job = await latest.json() as Job;
  expect(job.status).toBe('completed');
  expect(validResult(job.result, job.request)).toBe(true);
  return job.result!;
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }

test('dev-server visual smoke: catalog, both modules, controls, navigation, no overlays', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/algorithms'); await expect(page.getByRole('article')).toHaveCount(4);
  for (const id of ['vqe', 'qaoa']) {
    await page.getByRole('link', { name: `Explore ${id.toUpperCase()}`, exact: true }).click();
    await ready(page); await expect(page).toHaveTitle(`${id.toUpperCase()} · Quantum Learning`);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(button(page, 'Run optimization')).toBeDisabled();
    await page.getByRole('heading', { name: id.toUpperCase(), exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${id}-initial.png`) });
    await noOverflow(page); await page.getByRole('link', { name: '← All algorithms' }).click();
  }
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) for (const algorithm of ['vqe', 'qaoa'] as const) for (const simulator of ['qiskit', 'pennylane'] as const) {
  test(`real ${algorithm} ${simulator} at ${width}px: optimize, convergence, samples, state`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [], ai: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    page.on('request', r => { if (r.url().includes('/api/ai/')) ai.push(r.url()); });
    await page.goto(`/algorithms/${algorithm}`); await ready(page);
    await page.getByLabel('Simulator', { exact: true }).selectOption(simulator);
    const result = await run(page), o = result.optimization;
    expect(result.simulation.backend).toBe(simulator);
    expect(o.evaluations).toBeGreaterThan(10);
    expect(result.referenceGap).toBeGreaterThanOrEqual(-1e-10);
    expect(result.referenceGap).toBeLessThan(1e-6);
    expect(Object.values(result.simulation.counts).reduce((a, b) => a + b, 0)).toBe(1024);
    await expect(page.getByTestId('variational-backend')).toContainText(simulator === 'qiskit' ? 'Qiskit Aer' : 'PennyLane');
    await expect(page.getByTestId('variational-best')).toContainText(o.bestExpectation.toFixed(8));
    await expect(page.getByRole('img', { name: new RegExp(`${o.evaluations} actual evaluations`) })).toBeVisible();
    await page.getByRole('heading', { name: 'The evidence from your experiment.' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath('result.png') });
    await page.getByRole('heading', { name: algorithm === 'vqe' ? 'Follow the energy downward' : 'Follow the expected cut upward' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath('convergence.png') });
    await button(page, 'Sampled counts').click();
    const sampled = algorithm === 'vqe' ? '00' : result.cut!.bestSampledBitstring;
    await expect(page.getByTestId(`variational-count-${sampled}`)).toContainText(String(result.simulation.counts[sampled]));
    await button(page, 'Initial zeros').click(); await expect(page.getByLabel('Trace step', { exact: true })).toHaveValue('0');
    await button(page, 'Next step').click(); await button(page, 'Step statevector').click();
    await expect(page.getByRole('region', { name: 'Trace statevector amplitudes', exact: true })).toBeVisible();
    if (width === 390) { await button(page, 'Qubit sphere').click(); await expect(button(page, 'Inspect q0')).toBeVisible(); await button(page, 'Joint state').click(); }
    await noOverflow(page);
    await page.getByRole('heading', { name: 'Explore the best trial state, gate by gate' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath('state.png') });
    await page.getByRole('radio', { name: algorithm === 'vqe' ? 'The X terms also depend on relative phases' : 'No; expectation averages the cut values over many possible outcomes' }).check();
    await button(page, 'Check my answer').click(); await expect(page.getByText('Correct. Exact expectations', { exact: false })).toBeVisible();
    expect(errors).toEqual([]); expect(ai).toEqual([]);
    await info.attach('actual-result.json', { body: JSON.stringify(result), contentType: 'application/json' });
  });
}

test('QAOA graph, depth and manual angles are bound to real preview and result', async ({ page }) => {
  await page.goto('/algorithms/qaoa'); await ready(page);
  await button(page, 'Move vertex 0').click(); await expect(page.getByTestId('classical-cut')).toContainText('01 → cut value 1');
  await page.getByLabel('MaxCut graph').selectOption('weighted-path'); await ready(page);
  await page.getByLabel('QAOA depth').selectOption('2'); await ready(page);
  await page.getByText('Execution limits & initial angles', { exact: true }).click();
  await page.getByLabel('gamma0 · cost layer 1', { exact: true }).fill('0.4');
  await button(page, 'Apply initial angles').click(); await ready(page);
  const result = await run(page);
  expect(result.definition.request.algorithm).toBe('qaoa');
  expect(result.definition.problem.id).toBe('weighted-path');
  expect(result.optimization.initialParameters[0]).toBe(.4);
  expect(result.optimization.initialParameters).toHaveLength(4);
  expect(result.definition.circuit.numQubits).toBe(3);
});

test('VQE angle validation, tiny budget and persisted settings do not retain stale results', async ({ page }) => {
  await page.goto('/algorithms/vqe'); await ready(page);
  await page.getByText('Execution limits & initial angles', { exact: true }).click();
  await page.getByLabel('theta0 · initial RY q0', { exact: true }).fill('Infinity');
  await expect(button(page, 'Apply initial angles')).toBeDisabled();
  await page.getByLabel('theta0 · initial RY q0', { exact: true }).fill('0');
  await button(page, 'Apply initial angles').click(); await ready(page);
  await page.getByLabel('Evaluation budget').selectOption('4');
  const result = await run(page); expect(result.optimization.stoppingReason).toBe('evaluation_limit');
  expect(result.optimization.evaluations).toBe(4);
  await page.getByLabel('Initialization seed').selectOption('7'); await ready(page);
  await expect(page.getByTestId('variational-best')).toHaveCount(0);
  await expect(button(page, 'Run optimization')).toBeDisabled();
  await page.reload(); await ready(page); await expect(page.getByLabel('Initialization seed')).toHaveValue('7');
  await expect(page.getByLabel('Evaluation budget')).toHaveValue('4');
});

for (const algorithm of ['vqe', 'qaoa'] as const) test(`${algorithm} optimized Lab copy preserves free draft, Undo and reload`, async ({ page }) => {
  await page.goto('/lab?workspace=free');
  await button(page, 'Choose X gate').click();
  await page.getByRole('button', { name: 'Place gate on q0 at step 1', exact: true }).click();
  const before = await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'));
  // The free draft key is inspected after actual UI editing, not injected.
  const freeStorage = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.includes('free'))));
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Algorithms', exact: true }).click();
  await page.getByRole('link', { name: `Explore ${algorithm.toUpperCase()}`, exact: true }).click();
  const result = await run(page);
  await button(page, 'Open optimized circuit in Lab ↗').click();
  await expect(page).toHaveURL(new RegExp(`/lab\\?algorithm=${algorithm}&snapshot=${result.definition.circuitDigest}`));
  await expect(page.getByText('Algorithm circuit · editable copy', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Simulator', { exact: true })).toHaveValue(result.simulation.backend);
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(before);
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.includes('free'))))).toEqual(freeStorage);
  await button(page, 'Choose X gate').click();
  await button(page, `Place gate on q0 at step ${result.definition.circuit.gates.length + 1}`).click();
  await button(page, 'Undo').click(); await button(page, 'Redo').click();
  await page.getByRole('link', { name: 'Open free exploration', exact: true }).click();
  await expect(button(page, 'Undo')).toBeEnabled(); await button(page, 'Undo').click();
  await expect(button(page, 'Redo')).toBeEnabled(); await button(page, 'Redo').click();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(before);
  await page.goBack(); await page.reload();
  await expect(page.getByText('Algorithm circuit · editable copy', { exact: true })).toBeVisible();
  await button(page, 'Explore steps').click();
  await expect(page.getByRole('region', { name: 'State Explorer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(before);
});

test('late POST from an old simulator cannot overwrite the new selection; accepted job is cancelled', async ({ page }) => {
  let release!: () => void, accepted!: () => void, delivered!: () => void, oldUrl = '';
  const held = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { accepted = resolve; });
  const handled = new Promise<void>(resolve => { delivered = resolve; });
  await page.route('**/api/variational/jobs/*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    oldUrl = route.request().url(); const response = await route.fetch(); accepted(); await held;
    await route.fulfill({ response }); delivered();
  });
  await page.goto('/algorithms/vqe'); await predict(page); await button(page, 'Run optimization').click(); await seen;
  await page.getByLabel('Simulator', { exact: true }).selectOption('pennylane'); await ready(page);
  release(); await handled; await page.unroute('**/api/variational/jobs/*');
  await expect.poll(async () => (await (await page.request.get(oldUrl)).json() as Job).status).not.toBe('running');
  await expect(page.getByTestId('variational-best')).toHaveCount(0);
  const next = await run(page); expect(next.simulation.backend).toBe('pennylane');
});

test('late final poll cannot restore stale results after graph changes', async ({ page }) => {
  let release!: () => void, received!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { received = resolve; });
  await page.route('**/api/variational/jobs/*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(), data = await response.json() as Job;
    if (data.status === 'completed') { received(); await held; }
    await route.fulfill({ response });
  });
  await page.goto('/algorithms/qaoa'); await predict(page); await button(page, 'Run optimization').click(); await seen;
  await page.getByLabel('MaxCut graph').selectOption('triangle'); await ready(page); release();
  await expect(page.getByTestId('variational-best')).toHaveCount(0);
  await expect(button(page, 'Run optimization')).toBeDisabled();
  await page.unroute('**/api/variational/jobs/*');
  const next = await run(page); expect(next.definition.problem.id).toBe('triangle');
});

test('Cancel waits for backend acknowledgement and releases slot for another real run', async ({ page }) => {
  await page.goto('/algorithms/vqe'); await predict(page);
  const started = page.waitForResponse(r => r.url().includes('/api/variational/jobs/') && r.request().method() === 'POST');
  await button(page, 'Run optimization').click(); const url = (await started).url();
  await button(page, 'Cancel optimization').click();
  await expect(button(page, 'Run optimization')).toBeEnabled();
  const ended = await (await page.request.get(url)).json() as Job;
  expect(['cancelled', 'completed']).toContain(ended.status);
  const result = await run(page); expect(result.optimization.evaluations).toBeGreaterThan(4);
});

test('real partial objective history renders while a worker is still running', async ({ page }) => {
  let release!: () => void, received!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), partial = new Promise<void>(resolve => { received = resolve; });
  let count = 0;
  await page.route('**/api/variational/jobs/*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(), data = await response.json() as Job;
    if (data.status === 'completed') await held; // Delay delivery only; never fabricate objective values or status.
    await route.fulfill({ response });
    if (!count && data.status === 'running' && data.history.length > 0) { count = data.history.length; received(); }
  });
  await page.goto('/algorithms/qaoa'); await ready(page);
  await page.getByLabel('Simulator', { exact: true }).selectOption('pennylane'); await ready(page);
  await page.getByLabel('MaxCut graph').selectOption('triangle'); await ready(page);
  await page.getByLabel('QAOA depth').selectOption('2'); await predict(page);
  await button(page, 'Run optimization').click();
  await partial;
  await expect(page.getByRole('region', { name: 'Optimization convergence' })).toBeVisible();
  expect(count).toBeGreaterThan(0);
  await expect(button(page, 'Cancel optimization')).toBeEnabled();
  await expect(page.getByTestId('variational-best')).toHaveCount(0);
  release();
  await expect(page.getByRole('region', { name: 'Variational results', exact: true })).toBeVisible();
});

test('preview outage and busy service show honest retryable errors', async ({ page }) => {
  await page.route('**/api/variational/build', r => r.fulfill({ status: 503, json: { error: { message: 'Backend offline' } } }));
  await page.goto('/algorithms/vqe'); await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await page.unroute('**/api/variational/build'); await button(page, 'Retry preview').click(); await ready(page);
  await page.route('**/api/variational/jobs/*', r => r.request().method() === 'POST' ? r.fulfill({ status: 429, json: { error: { message: 'One optimization is already running.' } } }) : r.continue());
  await predict(page); await button(page, 'Run optimization').click();
  await expect(page.getByRole('alert')).toContainText('HTTP 429'); await expect(page.getByTestId('variational-best')).toHaveCount(0);
  await page.unroute('**/api/variational/jobs/*'); await run(page);
});

test('client rejects corrupted scientific data and mismatched experiment identities from real results', async ({ page }) => {
  await page.goto('/algorithms/qaoa'); const real = await run(page), req = real.definition.request;
  expect(validDefinition(real.definition, req)).toBe(true);
  const mutations: ((r: Result) => void)[] = [
    r => { r.definition.request.backend = 'pennylane'; }, r => { r.simulation.counts['00']!++; },
    r => { r.optimization.bestExpectation += .1; }, r => { r.optimization.history[0]!.objective *= -1; },
    r => { r.optimization.bestParameters[0] = 4; }, r => { r.referenceGap = -.1; },
    r => { r.cut!.optimalCutProbability = 0; }, r => { r.cut!.bestSampledCount = 0; },
    r => { r.definition.reference.value = 10; }, r => { r.trace.steps.pop(); },
  ];
  for (const mutate of mutations) { const damaged = structuredClone(real); mutate(damaged); expect(validResult(damaged, req)).toBe(false); }
  expect(validRequest({ ...defaults('vqe'), initialParameters: [0, 1, 2, Infinity] })).toBe(false);
  expect(validRequest({ ...defaults('qaoa'), depth: 3 })).toBe(false);
});
