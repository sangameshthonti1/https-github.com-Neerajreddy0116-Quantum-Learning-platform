import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { AlgorithmRun } from '../src/algorithms/types';
import { validRun } from '../src/algorithms/api';

let backend: ChildProcess | undefined;
async function startBackend() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_AI_ENABLED: 'false', QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; backend.stderr?.on('data', (c: Buffer) => { log += c.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(log);
    try { return (await fetch('http://127.0.0.1:8001/api/health', { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; }
  }, { timeout: 15000 }).toBe(200);
}
async function stopBackend() {
  const child = backend; backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
}
test.beforeAll(startBackend);
test.afterAll(stopBackend);
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const resultRegion = (page: Page) => page.getByRole('region', { name: 'Algorithm results', exact: true });
async function predict(page: Page) {
  await expect(page.getByRole('heading', { name: 'Generated circuit', exact: true })).toBeVisible();
  const radio = page.getByRole('radio', { name: 'I’m not sure yet', exact: true });
  if (await radio.isEnabled()) { await radio.check(); await button(page, 'Submit prediction').click(); }
}
async function run(page: Page): Promise<AlgorithmRun> {
  await predict(page);
  const response = page.waitForResponse(r => r.url().endsWith('/api/algorithms/run'));
  await button(page, 'Run algorithm').click();
  const actual = await response; expect(actual.status()).toBe(200);
  await expect(resultRegion(page)).toBeVisible();
  return await actual.json() as AlgorithmRun;
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }

test('catalog, navigation, direct routes, and unavailable algorithms', async ({ page }) => {
  await page.goto('/algorithms');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByText('Available', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Algorithms', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Explore Deutsch–Jozsa', exact: true }).click();
  await expect(page).toHaveURL('/algorithms/deutsch-jozsa');
  await expect(page).toHaveTitle('Deutsch–Jozsa · Quantum Learning');
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).click();
  await expect(page).toHaveURL('/algorithms/grover');
  await expect(page).toHaveTitle('Grover’s search · Quantum Learning');
  await page.goto('/algorithms/unavailable');
  await expect(page.getByRole('heading', { name: 'That algorithm is not in this collection.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to algorithms' }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'))).toBeNull();
});

for (const width of [1440, 390]) for (const oracle of ['one', 'q1']) {
  test(`real Deutsch–Jozsa ${oracle} at ${width}px: classification, helper, trace, and counts`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [], ai: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.url().includes('/api/ai/')) ai.push(r.url()); });
    await page.goto('/algorithms/deutsch-jozsa');
    await page.getByLabel('Oracle rule', { exact: true }).selectOption(oracle);
    const result = await run(page), m = result.interpretation;
    if (m.algorithm !== 'deutsch-jozsa') throw new Error('Wrong algorithm');
    expect(m.classification).toBe(oracle === 'one' ? 'constant' : 'balanced');
    expect(m.zeroInputProbability).toBeCloseTo(oracle === 'one' ? 1 : 0, 12);
    await expect(page.getByTestId('algorithm-conclusion')).toHaveText(oracle === 'one' ? 'Constant function' : 'Balanced function');
    expect(result.simulation.counts[oracle === 'one' ? '100' : '110']).toBeGreaterThan(0);
    for (const [label, p] of Object.entries(m.inputProbabilities)) {
      await expect(page.getByTestId(`algorithm-probability-${label}`)).toContainText(`${(p * 100).toFixed(4)}%`);
    }
    await button(page, 'Sampled counts').click();
    await expect(page.getByTestId(`algorithm-count-${oracle === 'one' ? '00' : '10'}`)).toContainText('1024');
    await button(page, 'Inspect Query the oracle').click();
    await button(page, 'Step statevector').click();
    await expect(page.getByRole('region', { name: 'Trace statevector amplitudes', exact: true })).toBeVisible();
    await expect(page.getByLabel('Trace step', { exact: true })).toHaveValue(String(result.definition.stages[2]!.endStep));
    await button(page, 'Previous step').click(); await button(page, 'Next step').click();
    if (width === 390) { await button(page, 'Qubit sphere').click(); await expect(button(page, 'Inspect q2')).toBeVisible(); await button(page, 'Joint state').click(); }
    await noOverflow(page);
    await info.attach(`dj-${oracle}.json`, { body: JSON.stringify(result), contentType: 'application/json' });
    expect(errors).toEqual([]); expect(ai).toEqual([]);
  });
}

for (const marked of ['00', '01', '10', '11']) test(`real Grover four-item search marks ${marked} with certainty after one iteration`, async ({ page }) => {
  await page.goto('/algorithms/grover'); await button(page, `Mark item ${marked}`).click();
  const result = await run(page);
  if (result.interpretation.algorithm !== 'grover') throw new Error('Wrong algorithm');
  expect(result.interpretation.successProbability).toBeCloseTo(1, 12);
  expect(result.interpretation.sampledSuccessCount).toBe(1024);
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('100.00%');
  await button(page, 'Inspect Uniform superposition').click();
  await expect(page.getByTestId(`trace-probability-${marked}`)).toContainText('25.0000%');
  await button(page, 'Inspect 1 · Phase oracle').click();
  await expect(page.getByTestId(`trace-probability-${marked}`)).toContainText('25.0000%');
  await button(page, 'Step statevector').click();
  const amplitude = page.getByRole('region', { name: 'Trace statevector amplitudes' }).getByRole('row').filter({ hasText: `|${marked}⟩` });
  await expect(amplitude).toContainText('-0.5000');
  await button(page, 'Inspect 1 · Diffuser').click(); await button(page, 'Step probabilities').click();
  await expect(page.getByTestId(`trace-probability-${marked}`)).toContainText('100.0000%');
});

test('mobile Grover iteration history shows amplification and over-rotation using real trace values', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/algorithms/grover'); await page.getByLabel('Grover iterations', { exact: true }).selectOption('4');
  const result = await run(page);
  if (result.interpretation.algorithm !== 'grover') throw new Error('Wrong algorithm');
  expect(result.interpretation.iterations.map(o => Math.round(o.successProbability * 100))).toEqual([25, 100, 25, 25, 100]);
  await button(page, '2 · After diffuser 25.00%').click();
  await expect(page.getByLabel('Trace step', { exact: true })).toHaveValue(String(result.interpretation.iterations[2]!.step));
  await noOverflow(page);
});

test('one-input Deutsch and two-item Grover boundary examples execute', async ({ page }) => {
  await page.goto('/algorithms/deutsch-jozsa'); await page.getByLabel('Input register', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Oracle rule').locator('option')).toHaveCount(4);
  await page.getByLabel('Oracle rule').selectOption('q0');
  const dj = await run(page); expect(dj.definition.circuit.numQubits).toBe(2);
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('Balanced function');
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).click();
  await page.getByLabel('Search space', { exact: true }).selectOption('1');
  await page.getByLabel('Grover iterations').selectOption('3');
  const g = await run(page); expect(g.definition.circuit.numQubits).toBe(1);
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('50.00%');
});

test('oracle, mark, iterations, register size and shots invalidate data and predictions', async ({ page }) => {
  await page.goto('/algorithms/deutsch-jozsa'); await run(page);
  await page.getByLabel('Oracle rule').selectOption('xor');
  await expect(resultRegion(page)).toHaveCount(0);
  await expect(button(page, 'Run algorithm')).toBeDisabled();
  await expect(page.getByText('Selections changed.', { exact: false })).toBeVisible();
  await run(page); await page.getByLabel('Input register').selectOption('1');
  await expect(resultRegion(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).click(); await run(page);
  await button(page, 'Mark item 00').click(); await expect(resultRegion(page)).toHaveCount(0); await run(page);
  await page.getByLabel('Grover iterations').selectOption('2'); await expect(resultRegion(page)).toHaveCount(0);
  await run(page); await expect(page.getByTestId('algorithm-conclusion')).toHaveText('25.00%');
  await page.getByLabel('Algorithm shots').selectOption('128'); await expect(resultRegion(page)).toHaveCount(0);
  const result = await run(page); expect(result.simulation.shots).toBe(128);
  await page.getByLabel('Search space').selectOption('1'); await expect(resultRegion(page)).toHaveCount(0);
});

test('late real execution cannot overwrite newer selections or their results', async ({ page }) => {
  await page.goto('/algorithms/grover'); await predict(page);
  let release = () => {}, received = false, calls = 0, delivered = 0;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/algorithms/run', async route => {
    const response = await route.fetch();
    calls++;
    if (calls === 1) { received = true; await hold; }
    await route.fulfill({ response });
    delivered++;
  });
  try {
    await button(page, 'Run algorithm').click();
    await expect(button(page, 'Running with Qiskit…')).toBeDisabled();
    await expect.poll(() => received).toBe(true);
    await page.getByLabel('Grover iterations').selectOption('2');
    await run(page); await expect(page.getByTestId('algorithm-conclusion')).toHaveText('25.00%');
  } finally { release(); }
  await expect.poll(() => delivered).toBe(2);
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('25.00%');
  await expect(page.getByRole('radio', { name: 'I’m not sure yet' })).toBeChecked();
});

test('late circuit preview cannot replace a newer oracle selection', async ({ page }) => {
  await page.goto('/algorithms/deutsch-jozsa'); await expect(page.getByRole('heading', { name: 'Generated circuit' })).toBeVisible();
  let release = () => {}, received = false, delivered = false;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/algorithms/build', async route => {
    const response = await route.fetch();
    if (route.request().postDataJSON().oracleId === 'q0') { received = true; await hold; }
    await route.fulfill({ response });
    if (route.request().postDataJSON().oracleId === 'q0') delivered = true;
  });
  try {
    await page.getByLabel('Oracle rule').selectOption('q0'); await expect.poll(() => received).toBe(true);
    await page.getByLabel('Oracle rule').selectOption('q1');
    await expect(page.getByRole('heading', { name: 'Generated circuit' })).toBeVisible();
  } finally { release(); }
  await expect.poll(() => delivered).toBe(true);
  const result = await run(page);
  expect(result.definition.parameters).toMatchObject({ oracleId: 'q1' });
  if (result.interpretation.algorithm === 'deutsch-jozsa') expect(result.interpretation.inputProbabilities['10']).toBeCloseTo(1, 12);
});

test('classical queries, prediction, and understanding retry teach without awarding unrelated progress', async ({ page }) => {
  await page.goto('/algorithms/deutsch-jozsa');
  await button(page, 'Query input 00').click(); await button(page, 'Query input 01').click();
  await expect(page.getByText('2 classical queries.', { exact: false })).toContainText('not enough evidence');
  await button(page, 'Query input 10').click();
  await expect(page.getByText('3 classical queries.', { exact: false })).toContainText('constant is now certain');
  const check = page.locator('#understanding');
  await check.getByRole('radio', { name: 'Balanced, because the bitstring contains a 1' }).check();
  await button(page, 'Check my answer').click(); await expect(check).toContainText('leading 1 belongs to helper q2');
  await button(page, 'Try this question again').click();
  await check.getByRole('radio', { name: 'Constant, because the two input bits are 00' }).check();
  await button(page, 'Check my answer').click(); await expect(check).toContainText('Correct. Only q1q0');
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-challenges-v1'))).toBeNull();
});

test('opening an editable Lab copy preserves free draft and Undo history, return route, and source result', async ({ page }) => {
  await page.goto('/lab?workspace=free');
  await button(page, 'Place gate on q0 at step 1').click();
  const free = await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'));
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Algorithms', exact: true }).click();
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).click();
  const result = await run(page);
  await button(page, 'Open a copy in Circuit Lab ↗').click();
  await expect(page).toHaveURL(new RegExp(`/lab\\?algorithm=grover&snapshot=${result.definition.circuitDigest}`));
  await expect(page.getByText('Algorithm circuit · editable copy', { exact: true })).toBeVisible();
  const source = await page.evaluate(digest => JSON.parse(sessionStorage.getItem(`qlp-circuit-algorithm:grover:${digest}-v1`) ?? 'null'), result.definition.circuitDigest);
  expect(source).toEqual(result.definition.circuit);
  await button(page, 'Choose X gate').click();
  await button(page, `Place gate on q0 at step ${source.gates.length + 1}`).click();
  await button(page, 'Undo').click(); await button(page, 'Redo').click();
  await page.getByRole('link', { name: 'Return to algorithm', exact: true }).click();
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('100.00%');
  await button(page, 'Open a copy in Circuit Lab ↗').click();
  await button(page, 'Explore steps').click();
  await expect(page.getByRole('region', { name: 'State Explorer', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('Algorithm circuit · editable copy', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open free exploration', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(free);
  // Reload deliberately starts new Undo history; re-create one edit and check isolated restore through navigation.
  await button(page, 'Place gate on q0 at step 2').click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Algorithms', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Circuit Lab', exact: true }).click();
  await button(page, 'Undo').click();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(free);
});

test('blocked storage retains algorithm state and isolated Lab handoff in memory', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; Storage.prototype.getItem = () => { throw new Error('blocked'); }; });
  await page.goto('/algorithms/grover'); await run(page);
  await button(page, 'Open a copy in Circuit Lab ↗').click();
  await expect(page.getByText('Algorithm circuit · editable copy', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Return to algorithm', exact: true }).click();
  await expect(page.getByTestId('algorithm-conclusion')).toHaveText('100.00%');
});

test('missing or corrupted saved algorithm source gives recovery without touching free draft', async ({ page }) => {
  await page.goto('/lab?workspace=free');
  const before = await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'));
  await page.goto('/lab?algorithm=grover&snapshot=' + 'a'.repeat(64));
  await expect(page.getByRole('heading', { name: 'Algorithm copy unavailable' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(before);
});

test('real HTTP validation failure clears previous results and can recover', async ({ page }) => {
  await page.goto('/algorithms/grover'); await run(page);
  await page.route('**/api/algorithms/run', route => route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), iterations: 5 }) }));
  const response = page.waitForResponse('**/api/algorithms/run'); await button(page, 'Run algorithm').click();
  expect((await response).status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText('Request validation failed (HTTP 422)');
  await expect(resultRegion(page)).toHaveCount(0);
  await page.unroute('**/api/algorithms/run'); await run(page);
});

test('corrupted numerical interpretations and snapshot mismatches never render as scientific results', async ({ page }) => {
  await page.goto('/algorithms/grover');
  await page.route('**/api/algorithms/run', async route => {
    const response = await route.fetch(), body = await response.json();
    body.interpretation.successProbability = 0.5;
    await route.fulfill({ response, json: body });
  });
  await predict(page); await button(page, 'Run algorithm').click();
  await expect(page.getByRole('alert')).toContainText('verified data contract'); await expect(resultRegion(page)).toHaveCount(0);
  await page.unroute('**/api/algorithms/run');
  const real = await run(page);
  expect(validRun(real, real.definition)).toBe(true);
  const wrong = structuredClone(real); wrong.definition.circuit.gates[0]!.type = 'x';
  expect(validRun(wrong, real.definition)).toBe(false);
  const phase = structuredClone(real); phase.trace.steps.at(-1)!.statevector[2]!.real *= -1;
  expect(validRun(phase, real.definition)).toBe(false);
});

for (const width of [320, 390, 768]) test(`desktop/mobile accessibility and expanded details at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/algorithms'); await expect(page.getByRole('article')).toHaveCount(4); await noOverflow(page);
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('link', { name: 'Build & predict', exact: true }).click();
  await page.getByRole('radio', { name: 'I’m not sure yet' }).focus(); await page.keyboard.press('Space');
  await button(page, 'Submit prediction').focus(); await page.keyboard.press('Enter');
  await run(page);
  await page.getByText('Optional mathematics · every symbol explained', { exact: true }).click();
  await page.getByText('Run details · exact parameters, circuit & raw values', { exact: true }).click();
  await page.getByText('Trace Details', { exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`algorithm-${width}.png`), fullPage: true });
});

test('actual backend outage removes execution results and catalog retry recovers', async ({ page }) => {
  await page.goto('/algorithms/grover'); await run(page);
  await stopBackend();
  try {
    await button(page, 'Run algorithm').click(); await expect(page.getByRole('alert')).toContainText('Algorithm service unavailable');
    await expect(resultRegion(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'All algorithms', exact: false }).click();
    await expect(page.getByRole('alert')).toContainText('Algorithms could not load');
  } finally { await startBackend(); }
  await button(page, 'Retry loading algorithms').click(); await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('link', { name: 'Explore Grover’s search', exact: true }).click(); await run(page);
});
