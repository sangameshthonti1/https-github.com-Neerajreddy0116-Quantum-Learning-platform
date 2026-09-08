import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SimulationRequest, SimulationResponse, TraceResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
async function stopBackend() {
  const child = backend; backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
}
async function startBackend() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  backend.stdout?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(log);
    try { return (await fetch('http://127.0.0.1:8001/api/health', { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; }
  }, { timeout: 15000 }).toBe(200);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const next = (page: Page) => button(page, 'Next →').click();
const collect = (page: Page) => button(page, 'Collect experiment & return');
const section = (page: Page, index: number) => page.getByRole('navigation', { name: 'Lesson sections' }).getByRole('button').nth(index);
const quizGroups = (page: Page) => page.getByRole('form', { name: 'Understanding check' }).getByRole('group');
async function toPrediction(page: Page) {
  await page.goto('/learn/superposition');
  await next(page);
  await page.getByRole('radio', { name: 'Either 0 or 1', exact: true }).check();
  await button(page, 'Check my answer').click(); await next(page);
  await page.getByRole('radio', { name: '25%', exact: true }).check();
  await button(page, 'Check my answer').click(); await next(page); await next(page);
}
async function toLab(page: Page, prediction = '50% zero / 50% one') {
  await toPrediction(page);
  await page.getByRole('radio', { name: prediction, exact: true }).check();
  await button(page, 'Submit prediction').click(); await next(page);
  await page.getByRole('link', { name: 'Open the Lab: build one H →', exact: true }).click();
}
async function placeH(page: Page, step: number) {
  await button(page, 'Choose H gate').click();
  await button(page, `Place gate on q0 at step ${step}`).click();
}
async function run(page: Page) {
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/simulate') && r.request().method() === 'POST');
  await button(page, 'Run Simulation').click();
  const response = await pending; expect(response.status()).toBe(200);
  const body = await response.json() as SimulationResponse;
  await expect(button(page, 'Run Simulation')).toBeEnabled();
  return { request: response.request().postDataJSON() as SimulationRequest, body };
}
async function explore(page: Page, gates: number) {
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/simulate/trace') && r.request().method() === 'POST');
  await button(page, 'Explore steps').click();
  const response = await pending; expect(response.status()).toBe(200);
  const body = await response.json() as TraceResponse;
  await expect(page.getByTestId('trace-probability-0')).toContainText('100.0000%');
  await expect(collect(page)).toBeDisabled();
  for (let i = 0; i < gates; i++) await button(page, 'Next step').click();
  return { request: response.request().postDataJSON() as SimulationRequest, body };
}
async function oneH(page: Page) {
  await toLab(page); await placeH(page, 1);
  const simulation = await run(page); const trace = await explore(page, 1);
  await expect(collect(page)).toBeEnabled(); await collect(page).click();
  await expect(page.getByRole('heading', { name: 'Read your results', exact: true })).toBeVisible();
  return { simulation, trace };
}

test.beforeAll(startBackend);
test.afterAll(stopBackend);
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });

test('activities require explicit answers while unfinished navigation stays available', async ({ page }) => {
  await page.goto('/learn/superposition');
  await expect(button(page, '← Back')).toBeDisabled();
  await expect(section(page, 8)).toBeEnabled();
  await next(page); await expect(button(page, 'Next →')).toBeEnabled();
  await expect(button(page, 'Check my answer')).toBeDisabled();
  await page.getByRole('radio', { name: 'Both 0 and 1 in one reading' }).check();
  await button(page, 'Check my answer').click();
  await expect(page.getByRole('status')).toContainText('A single reading gives just one value');
  await expect(button(page, 'Next →')).toBeEnabled();
  await button(page, 'Try this question again').click();
  await page.getByRole('radio', { name: 'Either 0 or 1', exact: true }).check();
  await button(page, 'Check my answer').click(); await next(page);
  const slider = page.getByRole('slider', { name: /Chance of zero/ });
  await slider.focus(); await page.keyboard.press('Home');
  await expect(page.getByRole('meter', { name: 'Illustrated probability of zero' })).toHaveAttribute('value', '0');
  await expect(page.getByRole('meter', { name: 'Illustrated probability of one' })).toHaveAttribute('value', '100');
  await page.keyboard.press('End');
  await expect(page.getByRole('meter', { name: 'Illustrated probability of one' })).toHaveAttribute('value', '0');
  await page.getByRole('radio', { name: '25%', exact: true }).check();
  await button(page, 'Check my answer').click(); await next(page); await next(page);
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(page.getByText(/Starting in \|0⟩ does guarantee zero/)).toHaveCount(0);
  await expect(button(page, 'Submit prediction')).toBeDisabled();
  await page.getByRole('radio', { name: '100% zero', exact: true }).check();
  await expect(page.getByText(/Starting in \|0⟩ does guarantee zero/)).toHaveCount(0);
  await expect(button(page, 'Next →')).toBeEnabled();
  await button(page, 'Submit prediction').click();
  await expect(page.getByRole('status')).toContainText('H changes that state');
  await button(page, '← Back').click(); await next(page);
  await expect(page.getByRole('radio', { name: '100% zero', exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Your prediction: 100% zero');
});

for (const mobile of [false, true]) test(`complete ${mobile ? 'mobile reduced-motion' : 'desktop'} beginner walkthrough uses real H and HH, grades deterministically and retries`, async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
  await page.goto('/learn/superposition');
  await expect(page.getByRole('heading', { name: 'A different kind of bit', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('lesson-start.png'), fullPage: true });
  const h = await oneH(page);
  expect(h.simulation.request.gates).toHaveLength(1);
  expect(h.simulation.request.gates[0]).toMatchObject({ type: 'h', targets: [0], controls: [] });
  expect(h.trace.request).toEqual(h.simulation.request);
  expect(h.simulation.body.probabilities['0']).toBeCloseTo(0.5, 12);
  expect(h.trace.body.steps[1]!.statevector[0]!.real).toBeCloseTo(Math.SQRT1_2, 12);
  expect(h.trace.body.steps[1]!.statevector[1]!.real).toBeCloseTo(Math.SQRT1_2, 12);
  expect(h.trace.body.steps[1]!.qubits[0]!.blochVector.x).toBeCloseTo(1, 12);
  await expect(page.getByTestId('comparison-h')).toContainText('Your prediction agrees');
  await expect(page.getByTestId('lesson-h-probability-0')).toContainText('100.0000%');
  await button(page, 'After H').click();
  await expect(page.getByTestId('lesson-h-probability-0')).toContainText('50.0000%');
  await button(page, 'Next panel').click();
  await expect(page.getByRole('region', { name: 'Lesson amplitudes' })).toContainText('0.7071');
  await button(page, 'Next panel').click();
  await expect(page.getByTestId('bloch-values-q0')).toContainText('(1.0000, 0.0000, 0.0000)');
  await page.screenshot({ path: info.outputPath('lesson-state-map.png'), fullPage: true });
  await button(page, 'Next panel').click();
  for (const count of Object.values(h.simulation.body.counts)) await expect(page.getByTestId('lesson-counts-h')).toContainText(count.toLocaleString('en-US'));
  await expect(button(page, 'Next →')).toBeEnabled();
  await page.getByRole('radio', { name: 'No. Each shot samples a result, so the counts can differ.', exact: true }).check();
  await button(page, 'Check my answer').click();
  await next(page);
  await expect(page.getByText('Why does the second H undo the first?')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the Lab: add a second H →' })).toHaveCount(0);
  await page.getByRole('radio', { name: '50% zero / 50% one', exact: true }).check();
  await button(page, 'Submit prediction').click();
  await expect(page.getByText('Why does the second H undo the first?')).toHaveCount(0);
  await page.getByRole('link', { name: 'Open the Lab: add a second H →', exact: true }).click();
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  await placeH(page, 2);
  const hh = { simulation: await run(page), trace: await explore(page, 2) };
  expect(hh.simulation.request.gates).toHaveLength(2);
  expect(hh.simulation.request.gates[0]).toEqual(h.simulation.request.gates[0]);
  expect(hh.trace.request).toEqual(hh.simulation.request);
  expect(hh.simulation.body.probabilities['0']).toBeCloseTo(1, 12);
  expect(hh.trace.body.steps[2]!.probabilities['1']).toBeCloseTo(0, 12);
  await collect(page).click();
  await expect(page.getByTestId('comparison-hh')).toContainText('This differs from your prediction');
  await expect(page.getByRole('heading', { name: 'Why does the second H undo the first?' })).toBeVisible();
  await button(page, 'After H twice').click();
  await expect(page.getByTestId('lesson-hh-probability-0')).toContainText('100.0000%');
  await next(page);
  await expect(button(page, 'Grade my answers')).toBeDisabled();
  for (const group of await quizGroups(page).all()) await group.getByRole('radio').first().check();
  await button(page, 'Grade my answers').click();
  await expect(page.getByRole('status')).toContainText('1 of 5 correct');
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toHaveCount(0);
  await expect(page.getByText('Review this idea.', { exact: false })).toHaveCount(4);
  await button(page, 'Retry understanding check').click();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  const answers = [1, 1, 2, 0, 1];
  for (const [i, group] of (await quizGroups(page).all()).entries()) await group.getByRole('radio').nth(answers[i]!).check();
  await button(page, 'Grade my answers').click();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('5 of 5 correct');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  await section(page, 0).click();
  await expect(section(page, 5)).toContainText('Completed');
  await expect(section(page, 7)).toContainText('Completed');
  await expect(section(page, 8)).toContainText('Completed');
  await section(page, 8).click();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  // Migrate an existing v1 session without inferring completion from furthest.
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('qlp-superposition-v1')!);
    delete saved.visited; delete saved.readings; delete saved.quizAttempts;
    sessionStorage.setItem('qlp-superposition-v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  await expect(section(page, 0)).toContainText('Not started');
  await button(page, 'Retry understanding check').click();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  await section(page, 4).click();
  await expect(page.getByRole('status')).toContainText('Your prediction: 50% zero / 50% one');
  await section(page, 8).click();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('lesson-complete.png'), fullPage: true });
  await info.attach('real-experiments.json', { body: JSON.stringify({ h, hh }, null, 2), contentType: 'application/json' });
  console.log('Lesson real values:', JSON.stringify({ h: h.simulation.body, hBloch: h.trace.body.steps[1]!.qubits[0]!.blochVector, hh: hh.simulation.body }));
  expect(errors).toEqual([]);
});

for (const mobile of [false, true]) test(`free ${mobile ? 'mobile keyboard' : 'desktop'} navigation from section 1 to 9 never grants completion`, async ({ page }, info) => {
  if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
  await page.goto('/learn/superposition');
  await expect(section(page, 0)).toContainText('In progress');
  await expect(section(page, 8)).toContainText('Not started');
  for (const item of await page.getByRole('navigation', { name: 'Lesson sections' }).getByRole('button').all()) await expect(item).toBeEnabled();
  if (mobile) { await section(page, 8).focus(); await page.keyboard.press('Enter'); } else await section(page, 8).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding', exact: true })).toBeFocused();
  await expect(section(page, 8)).toHaveAttribute('aria-current', 'step');
  await expect(section(page, 8)).toContainText('In progress');
  await expect(section(page, 1)).toContainText('Not started');
  await expect(page.getByRole('progressbar', { name: 'Lesson sections completed' })).toHaveAttribute('value', '0');
  await expect(button(page, 'Grade my answers')).toBeDisabled();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toHaveCount(0);
  for (let index = 7; index >= 0; index--) {
    await button(page, '← Back').click();
    await expect(section(page, index)).toHaveAttribute('aria-current', 'step');
  }
  for (let index = 1; index <= 8; index++) {
    await next(page); await expect(section(page, index)).toHaveAttribute('aria-current', 'step');
  }
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  for (const item of await page.getByRole('navigation', { name: 'Lesson sections' }).getByRole('button').all()) await expect(item).toContainText('In progress');
  await section(page, 0).click(); await button(page, 'Mark as read').click();
  await expect(section(page, 0)).toContainText('Completed');
  await section(page, 8).click(); await section(page, 0).click(); await page.reload();
  await expect(button(page, 'Marked as read')).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('free-navigation.png'), fullPage: true });
});

test('prediction, submitted quiz attempt and retry draft survive section navigation and a Lab round trip', async ({ page }) => {
  await page.goto('/learn/superposition'); await section(page, 4).click();
  await page.getByRole('radio', { name: '100% zero', exact: true }).check(); await button(page, 'Submit prediction').click();
  await section(page, 8).click();
  for (const group of await quizGroups(page).all()) await group.getByRole('radio').first().check();
  await button(page, 'Grade my answers').click();
  await section(page, 0).click(); await section(page, 8).click();
  await expect(page.getByRole('status')).toContainText('1 of 5 correct');
  await button(page, 'Retry understanding check').click();
  await quizGroups(page).first().getByRole('radio').nth(1).check();
  await section(page, 5).click(); await page.getByRole('link', { name: 'Open the Lab: build one H →' }).click();
  await page.getByRole('link', { name: 'Return to lesson', exact: true }).first().click();
  await expect(section(page, 5)).toHaveAttribute('aria-current', 'step');
  await section(page, 4).click(); await expect(page.getByRole('status')).toContainText('Your prediction: 100% zero');
  await section(page, 8).click(); await page.reload();
  await expect(quizGroups(page).first().getByRole('radio').nth(1)).toBeChecked();
  await page.getByText('Submitted quiz attempts (1)', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quiz attempt 1' })).toContainText('1 of 5 correct');
  await expect(section(page, 8)).toContainText('In progress');
  await expect(section(page, 5)).not.toContainText('Completed');
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toHaveCount(0);
});

test('a graded quiz pass survives retries but never replaces real experiment evidence', async ({ page }) => {
  await page.goto('/learn/superposition'); await section(page, 8).click();
  const answers = [1, 1, 2, 0, 1];
  for (const [i, group] of (await quizGroups(page).all()).entries()) await group.getByRole('radio').nth(answers[i]!).check();
  await button(page, 'Grade my answers').click();
  await expect(section(page, 8)).toContainText('Completed');
  await expect(page.getByText(/Lesson completion still requires both verified Lab experiments/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toHaveCount(0);
  await button(page, 'Retry understanding check').click();
  for (const group of await quizGroups(page).all()) await group.getByRole('radio').first().check();
  await button(page, 'Grade my answers').click();
  await section(page, 5).click(); await section(page, 7).click(); await section(page, 8).click(); await page.reload();
  await expect(page.getByRole('status')).toContainText('1 of 5 correct');
  await expect(section(page, 8)).toContainText('Completed');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.getByText('Submitted quiz attempts (2)', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quiz attempt 1' })).toContainText('5 of 5 correct');
  await expect(page.getByRole('region', { name: 'Quiz attempt 2' })).toContainText('1 of 5 correct');
  await expect(page.getByRole('region', { name: 'Lesson complete' })).toHaveCount(0);
});

test('draft and prediction survive returning without running; recovery starts empty and undo restores construction', async ({ page }) => {
  await toLab(page, '100% zero');
  await expect(button(page, 'Select H gate at step 1')).toHaveCount(0);
  await placeH(page, 1);
  await page.getByRole('link', { name: 'Return to lesson', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Build it yourself', exact: true })).toBeVisible();
  await button(page, '← Back').click();
  await expect(page.getByRole('status')).toContainText('Your prediction: 100% zero');
  await next(page);
  await page.getByRole('link', { name: 'Open the Lab: build one H →' }).click();
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  await expect(collect(page)).toBeDisabled();
  await button(page, 'Start over with one empty qubit').click();
  await expect(button(page, 'Select H gate at step 1')).toHaveCount(0);
  await button(page, 'Undo').click();
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
});

test('wrong circuit and stale gate, qubit and shot snapshots never award experiment credit', async ({ page }) => {
  await toLab(page);
  await page.getByLabel('Load template', { exact: true }).selectOption('x');
  await run(page); await explore(page, 1);
  await expect(collect(page)).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Lesson experiment' })).toContainText('No other gates');
  await button(page, 'Start over with one empty qubit').click(); await placeH(page, 1);
  await run(page); await explore(page, 1); await expect(collect(page)).toBeEnabled();
  await page.getByLabel('Shots', { exact: true }).fill('2048');
  await expect(collect(page)).toBeDisabled();
  await button(page, 'Apply shots').click();
  await expect(collect(page)).toBeDisabled();
  await button(page, 'Undo').click(); await expect(collect(page)).toBeEnabled();
  await button(page, 'Add qubit').click(); await expect(collect(page)).toBeDisabled();
  await button(page, 'Undo').click(); await expect(collect(page)).toBeEnabled();
  await placeH(page, 2); await expect(collect(page)).toBeDisabled();
  await button(page, 'Undo').click(); await expect(collect(page)).toBeEnabled();
  // A different gate ID is a different snapshot even if the gate has the same action.
  await page.getByLabel('Load template', { exact: true }).selectOption('h');
  await expect(collect(page)).toBeDisabled();
  await run(page); await expect(collect(page)).toBeDisabled();
  await explore(page, 1); await expect(collect(page)).toBeEnabled();
});

test('late simulation after a circuit edit stays stale and cannot be collected', async ({ page }) => {
  await toLab(page); await placeH(page, 1);
  let release: () => void = () => {}; let received = false;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/simulate', async (route) => {
    const actual = await route.fetch(); received = true; await wait;
    await route.fulfill({ response: actual });
  });
  try {
    await button(page, 'Run Simulation').click();
    await expect.poll(() => received).toBe(true);
    await placeH(page, 2); release();
    await expect(page.getByRole('status').filter({ hasText: /^Stale$/ })).toBeVisible();
    await explore(page, 2); await expect(collect(page)).toBeDisabled();
    await button(page, 'Undo').click(); await expect(collect(page)).toBeDisabled();
    await page.unroute('**/api/simulate');
    await run(page); await explore(page, 1); await expect(collect(page)).toBeEnabled();
  } finally { release(); }
});

test('trace failure and retry do not reuse earlier inspection credit', async ({ page }) => {
  await toLab(page); await placeH(page, 1); await run(page); await explore(page, 1);
  await expect(collect(page)).toBeEnabled();
  await page.route('**/api/simulate/trace', (route) => route.abort('failed'));
  await button(page, 'Trace circuit').click();
  await expect(page.getByRole('alert')).toContainText('Trace API unavailable');
  await expect(collect(page)).toBeDisabled();
  await page.unroute('**/api/simulate/trace');
  await button(page, 'Retry trace').click();
  await expect(page.getByTestId('trace-probability-0')).toContainText('100.0000%');
  await expect(collect(page)).toBeDisabled();
  await button(page, 'Next step').click(); await expect(collect(page)).toBeEnabled();
});

test('direct guided Lab visit without prediction cannot collect a template result', async ({ page }) => {
  await page.goto('/?lesson=superposition&experiment=h');
  await expect(page.getByRole('region', { name: 'Lesson experiment' })).toContainText('Start with a prediction');
  await expect(collect(page)).toHaveCount(0);
});

test('actual backend outage blocks collection and preserves prediction for a successful retry', async ({ page }) => {
  await toLab(page, 'I’m not sure'); await placeH(page, 1); await run(page); await explore(page, 1);
  await stopBackend();
  await button(page, 'Run Simulation').click();
  await expect(page.getByRole('alert')).toContainText('API unavailable');
  await expect(collect(page)).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Lesson experiment' })).toContainText('I’m not sure');
  await startBackend();
  await run(page); await explore(page, 1); await collect(page).click();
  await expect(page.getByTestId('comparison-h')).toContainText('You now have an observation');
});
