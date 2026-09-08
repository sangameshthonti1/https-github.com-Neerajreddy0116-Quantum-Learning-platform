import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SimulationResponse, TraceResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
test.beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
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
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const section = (page: Page, index: number) => page.getByRole('navigation', { name: 'Lesson sections' }).getByRole('button').nth(index);
async function nav(page: Page, name: string) {
  if (await button(page, 'Open navigation').isVisible()) {
    await button(page, 'Open navigation').click();
    await page.getByRole('dialog', { name: 'Application navigation' }).getByRole('link', { name, exact: true }).click();
  } else await page.getByRole('complementary', { name: 'Application sidebar' }).getByRole('link', { name, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('dashboard and curriculum use real availability and do not create lesson activity', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start your quantum journey' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'))).toBeNull();
  await button(page, '01 prepare').click();
  await expect(page.getByRole('img', { name: /Conceptual map: the zero state/ })).toBeVisible();
  await button(page, '03 observe').click();
  await expect(page.getByText('Measuring |+⟩ gives one bit: 0 or 1, with equal chances.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard-desktop.png'), fullPage: true });
  await nav(page, 'Learn');
  await expect(page).toHaveURL('/learn');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'Start lesson', exact: true })).toHaveCount(4);
  await button(page, 'Available now 4').click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await button(page, 'All topics 4').click();
  await page.screenshot({ path: info.outputPath('curriculum-desktop.png'), fullPage: true });
  await nav(page, 'Progress');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await expect(page.getByText('No lesson activity yet.', { exact: false })).toHaveCount(4);
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'))).toBeNull();
  expect(errors).toEqual([]);
});

for (const [route, heading, active] of [
  ['/', /Quantum makes sense/, 'Dashboard'], ['/dashboard', /Quantum makes sense/, 'Dashboard'],
  ['/learn/', /Big ideas/, 'Learn'], ['/learn/superposition', /Superposition and/, 'Learn'],
  ['/lab', /^Circuit Lab$/, 'Circuit Lab'], ['/lab/states', /^Circuit Lab$/, 'Circuit Lab'],
  ['/algorithms', /Algorithms, built/, 'Algorithms'], ['/challenges', /Put your intuition/, 'Challenges'],
  ['/progress', /Every observation/, 'Progress'],
] as const) test(`direct route ${route} loads with correct active navigation`, async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  const current = page.getByRole('navigation', { name: 'Main navigation' }).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1); await expect(current).toContainText(active);
  if (route === '/lab/states') await expect(button(page, 'State Explorer')).toHaveAttribute('aria-pressed', 'true');
  if (route === '/algorithms' || route === '/challenges') await expect(page.getByText('Upcoming', { exact: true })).toBeVisible();
  await noOverflow(page);
});

for (const width of [320, 390, 768]) test(`navigation and layout remain accessible at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (width <= 760) {
    await button(page, 'Open navigation').click();
    const dialog = page.getByRole('dialog', { name: 'Application navigation' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'Progress', exact: true }).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
    await page.screenshot({ path: info.outputPath(`drawer-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(button(page, 'Open navigation')).toBeFocused();
  }
  await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`), fullPage: true });
  await nav(page, 'Learn');
  await expect(page.getByRole('heading', { level: 1, name: /Big ideas/ })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`curriculum-${width}.png`), fullPage: true });
  await nav(page, 'Circuit Lab');
  await expect(button(page, 'Run Simulation')).toBeVisible();
  await noOverflow(page);
});

test('collapse preference survives reload and focused workspace expansion does not squeeze the canvas', async ({ page }) => {
  await page.goto('/');
  await button(page, 'Collapse navigation').click();
  await page.reload();
  await expect(button(page, 'Expand navigation')).toBeVisible();
  await nav(page, 'Circuit Lab');
  const before = await page.locator('.lab-workspace').boundingBox();
  expect(before!.width).toBeGreaterThan(650);
  await button(page, 'Expand navigation').click();
  const after = await page.locator('.lab-workspace').boundingBox();
  expect(after!.width).toBe(before!.width);
  await button(page, 'Collapse navigation').click();
  await expect(button(page, 'Expand navigation')).toBeVisible();
});

test('free circuit and undo history survive navigation, browser history, and draft reload', async ({ page }) => {
  await page.goto('/lab');
  await button(page, 'Choose X gate').click(); await button(page, 'Place gate on q1 at step 1').click();
  await nav(page, 'Dashboard'); await nav(page, 'Learn'); await nav(page, 'Circuit Lab');
  await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await button(page, 'Undo').click(); await expect(button(page, 'Select X gate at step 1')).toHaveCount(0);
  await button(page, 'Redo').click();
  await page.goBack(); await expect(page).toHaveURL('/learn');
  await page.goForward(); await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await page.reload(); await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await nav(page, 'Dashboard');
  await page.getByRole('link', { name: /LOOK INSIDE State Explorer/ }).click();
  await expect(button(page, 'State Explorer')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Select X gate at step 1')).toBeVisible();
});

test('guided exercise drafts are isolated from free exploration and both can be resumed', async ({ page }) => {
  await page.goto('/lab');
  await button(page, 'Choose X gate').click(); await button(page, 'Place gate on q0 at step 1').click();
  await nav(page, 'Learn'); await page.getByRole('article').filter({ hasText: 'Superposition & the Hadamard gate' }).getByRole('link', { name: 'Start lesson', exact: true }).click();
  await section(page, 5).click(); await page.getByRole('link', { name: 'Open the Lab: build one H →' }).click();
  await expect(button(page, 'Select X gate at step 1')).toHaveCount(0);
  await button(page, 'Choose H gate').click(); await button(page, 'Place gate on q0 at step 1').click();
  await nav(page, 'Dashboard'); await nav(page, 'Circuit Lab');
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to lesson', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Open free exploration' }).click();
  await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lesson experiment' })).toHaveCount(0);
  await nav(page, 'Learn'); await page.getByRole('link', { name: 'Continue lesson', exact: true }).click();
  await page.getByRole('link', { name: 'Open the Lab: build one H →' }).click();
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
});

for (const mobile of [false, true]) test(`real ${mobile ? 'mobile' : 'desktop'} Dashboard → Learn → Lesson → Lab → State Explorer → lesson journey`, async ({ page }, info) => {
  if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await nav(page, 'Learn');
  await page.getByRole('article').filter({ hasText: 'Superposition & the Hadamard gate' }).getByRole('link', { name: 'Start lesson', exact: true }).click();
  await section(page, 8).click(); await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await section(page, 4).click();
  await page.getByRole('radio', { name: '50% zero / 50% one', exact: true }).check();
  await button(page, 'Submit prediction').click();
  await section(page, 5).click();
  await page.getByRole('link', { name: 'Open the Lab: build one H →' }).click();
  await button(page, 'Choose H gate').click(); await button(page, 'Place gate on q0 at step 1').click();
  const simulationResponse = page.waitForResponse((response) => response.url().endsWith('/api/simulate') && response.request().method() === 'POST');
  await button(page, 'Run Simulation').click();
  const simulation = await simulationResponse; expect(simulation.status()).toBe(200);
  const body = await simulation.json() as SimulationResponse;
  expect(body.probabilities['0']).toBeCloseTo(.5, 10);
  const traceResponse = page.waitForResponse((response) => response.url().endsWith('/api/simulate/trace'));
  await button(page, 'Explore steps').click();
  const trace = await traceResponse; expect(trace.status()).toBe(200);
  expect((await trace.json() as TraceResponse).steps).toHaveLength(2);
  await expect(page.getByTestId('trace-probability-0')).toContainText('100.0000%');
  await expect(button(page, 'Collect experiment & return')).toBeDisabled();
  await button(page, 'Next step').click();
  await expect(page.getByTestId('trace-probability-0')).toContainText('50.0000%');
  if (mobile) await button(page, 'Qubit sphere').click();
  await expect(page.getByRole('img', { name: /Bloch sphere for q0/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('journey-explorer.png'), fullPage: true });
  await button(page, 'Collect experiment & return').click();
  await expect(page.getByRole('heading', { name: 'Read your results', exact: true })).toBeVisible();
  await expect(page.getByTestId('comparison-h')).toBeVisible();
  await nav(page, 'Dashboard');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qlp-superposition-v1')!));
  expect(saved.evidence.h.simulation).toEqual(body); expect(saved.predictions.h).toBe(1);
  await page.getByRole('link', { name: 'Continue lesson', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Read your results', exact: true })).toBeVisible();
  await nav(page, 'Circuit Lab');
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  // Uncollected results are local to a Lab mount; returning never reuses inspection credit.
  await expect(button(page, 'Collect experiment & return')).toBeDisabled();
  await noOverflow(page); expect(errors).toEqual([]);
});

test('blocked storage retains lesson and circuit during client navigation', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/'); await nav(page, 'Learn');
  await page.getByRole('article').filter({ hasText: 'Superposition & the Hadamard gate' }).getByRole('link', { name: 'Start lesson', exact: true }).click();
  await button(page, 'Mark as read').click();
  await nav(page, 'Circuit Lab'); await button(page, 'Place gate on q0 at step 1').click();
  await nav(page, 'Dashboard'); await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await nav(page, 'Circuit Lab'); await expect(button(page, 'Select H gate at step 1')).toBeVisible();
});

test('invalid saved free circuit recovers to a valid empty workspace and unknown paths show recovery', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('qlp-circuit-free-v1', JSON.stringify({ backend: 'qiskit', numQubits: 1, shots: 1024, gates: [{ type: 'invented', id: 'x', targets: [8], controls: [] }] })));
  await page.goto('/lab'); await expect(button(page, 'Place gate on q0 at step 1')).toBeVisible();
  await expect(button(page, 'Place gate on q1 at step 1')).toBeVisible();
  await page.goto('/not-a-real-page');
  await expect(page.getByRole('heading', { name: 'This page is outside our orbit.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Quantum makes sense/ })).toBeVisible();
});
