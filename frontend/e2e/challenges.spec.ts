import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Grade } from '../src/challenges/types';
import type { SimulationResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
test.beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_AI_ENABLED: 'false', QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
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
async function choose(page: Page, gate: string) {
  await expect(page.getByRole('heading', { name: 'Circuit Lab', exact: true })).toBeVisible();
  if (!await button(page, `Choose ${gate} gate`).isVisible()) await button(page, 'Gates & settings').click();
  await button(page, `Choose ${gate} gate`).click();
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
}
async function add(page: Page, gate: string, step: number, target = 0, control?: number) {
  await choose(page, gate);
  if (control !== undefined) await button(page, `Place gate on q${control} at step ${step}`).click();
  await button(page, `Place gate on q${target} at step ${step}`).click();
}
async function submit(page: Page) {
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/challenges/grade') && r.request().method() === 'POST');
  await button(page, 'Submit for grading').click();
  const result = await response; expect(result.status()).toBe(200);
  return await result.json() as Grade;
}
async function progress(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('qlp-challenges-v1') ?? '{}'));
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('catalog has honest availability, featured navigation, filters and no visit credit', async ({ page }, info) => {
  await page.goto('/challenges');
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByText('Available', { exact: true })).toHaveCount(8);
  expect(await progress(page)).toEqual({});
  await button(page, 'Completed 0').click();
  await expect(page.getByText('Your first verified solution belongs here.')).toBeVisible();
  await button(page, 'Show all challenges').click();
  await page.screenshot({ path: info.outputPath('catalog-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Build a Bell state', exact: true }).click();
  await expect(page).toHaveURL('/challenges/bell');
  await expect(page.getByRole('heading', { level: 1, name: 'Connected possibilities' })).toBeVisible();
  await expect(button(page, 'Place gate on q1 at step 1')).toBeVisible();
  await expect(page.getByLabel('Load template')).toHaveCount(0);
  expect(await progress(page)).toEqual({});
});

for (const mobile of [false, true]) for (const id of ['flip', 'bell', 'ghz']) {
  test(`real ${mobile ? 'mobile' : 'desktop'} ${id}: construct, simulate, grade, inspect and persist`, async ({ page }, info) => {
    if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const aiCalls: string[] = []; page.on('request', r => { if (r.url().includes('/api/ai/')) aiCalls.push(r.url()); });
    await page.goto(`/challenges/${id}`);
    if (id === 'flip') await add(page, 'X', 1);
    else { await add(page, 'H', 1); await add(page, 'CX', 2, 1, 0); if (id === 'ghz') await add(page, 'CX', 3, 2, 1); }
    const response = page.waitForResponse(r => r.url().endsWith('/api/simulate'));
    await button(page, 'Run Simulation').click();
    const actual = await (await response).json() as SimulationResponse;
    expect(actual.probabilities[id === 'flip' ? '1' : id === 'bell' ? '11' : '111']).toBeCloseTo(id === 'flip' ? 1 : .5, 10);
    const grade = await submit(page);
    expect(grade.score).toBe(100); expect(grade.metrics?.fidelity).toBeCloseTo(1, 10);
    await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
    const targetBasis = page.locator('.challenge-basis-item code');
    const basis = Array.from({ length: 2 ** actual.numQubits }, (_, i) => `|${i.toString(2).padStart(actual.numQubits, '0')}⟩`);
    await expect(targetBasis).toHaveText(basis);
    await expect(page.getByLabel(`Target amplitude for ${id === 'flip' ? '1' : id === 'bell' ? '11' : '111'}`, { exact: true })).toHaveText(id === 'flip' ? '+1.000' : '+0.707');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${id}-verified.png`), fullPage: true, animations: 'disabled' });
    await page.getByText('Inspect graded snapshot & evidence', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Graded snapshot amplitudes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Graded snapshot amplitudes' }).locator('tbody th')).toHaveText(basis);
    const saved = await progress(page);
    expect(saved[id].best).toEqual(grade); expect(saved[id].attempts).toBe(1); expect(saved[id].completedAt).toBeTruthy();
    await noOverflow(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
    await expect(button(page, `Select ${id === 'flip' ? 'X' : 'H'} gate at step 1`)).toBeVisible();
    await page.getByRole('link', { name: 'Back to challenges', exact: true }).click();
    await expect(page.getByRole('article').filter({ hasText: 'Completed' })).toHaveCount(1);
    expect(errors).toEqual([]); expect(aiCalls).toEqual([]);
  });
}

test('incorrect state, progressive hints, revision, success and stale feedback with undo', async ({ page }) => {
  await page.goto('/challenges/superposition');
  await page.getByText('Hints', { exact: true }).click();
  await button(page, 'Reveal hint 1 of 3').click();
  await expect(page.getByText('A bit flip still leaves only one possible outcome.')).toBeVisible();
  await expect(page.getByText('Look for a gate that spreads the amplitude across two basis states.')).toHaveCount(0);
  await button(page, 'Reveal hint 2 of 3').click(); await button(page, 'Reveal hint 3 of 3').click();
  const initial = await submit(page); expect(initial.score).toBe(50);
  await expect(page.getByRole('heading', { name: 'Keep experimenting' })).toBeVisible();
  expect((await progress(page)).superposition.completedAt).toBeNull();
  await add(page, 'H', 1);
  await expect(page.getByRole('heading', { name: 'Previous feedback is stale' })).toBeVisible();
  expect((await submit(page)).score).toBe(100);
  await add(page, 'Z', 2);
  await expect(page.getByRole('heading', { name: 'Previous feedback is stale' })).toBeVisible();
  const phase = await submit(page); expect(phase.score).toBe(0);
  await expect(page.getByText(/Your measurement probabilities match, but the relative phase does not/)).toBeVisible();
  await button(page, 'Undo').click();
  expect((await submit(page)).score).toBe(100);
  const saved = (await progress(page)).superposition;
  expect(saved.best.score).toBe(100); expect(saved.attempts).toBe(4); expect(saved.hints).toBe(3);
});

test('prepared state remains required even when an empty circuit reaches target; reset and resume preserve work', async ({ page }) => {
  await page.goto('/challenges/interference');
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  expect((await submit(page)).score).toBe(50);
  await button(page, 'Select H gate at step 1').click(); await button(page, 'Delete gate').click();
  const invalid = await submit(page); expect(invalid.valid).toBe(false); expect(invalid.targetAchieved).toBe(true); expect(invalid.score).toBe(0);
  await expect(page.getByRole('heading', { name: 'Check the circuit constraints' })).toBeVisible();
  expect((await progress(page)).interference.completedAt).toBeNull();
  await button(page, 'Reset challenge').click(); await add(page, 'H', 2);
  expect((await submit(page)).score).toBe(100);
  await page.reload(); await expect(button(page, 'Select H gate at step 2')).toBeVisible();
  await page.getByRole('link', { name: 'All challenges', exact: false }).click();
  await page.getByRole('link', { name: 'Untangle the pair', exact: true }).click();
  await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  await expect(button(page, 'Select CX control q0 at step 2')).toBeVisible();
  await add(page, 'CX', 3, 1, 0); await add(page, 'H', 4);
  expect((await submit(page)).score).toBe(100);
});

test('distribution grading accepts opposite relative phase and qubit mismatch is structured feedback', async ({ page }) => {
  await page.goto('/challenges/opposites');
  await add(page, 'H', 1); await add(page, 'CX', 2, 1, 0); await add(page, 'X', 3, 1); await add(page, 'Z', 4);
  const result = await submit(page); expect(result.score).toBe(100); expect(result.metrics?.fidelity).toBeNull();
  await expect(page.getByText(/Relative phase is intentionally unrestricted/)).toBeVisible();
  await button(page, 'Add qubit').click();
  const invalid = await submit(page); expect(invalid.valid).toBe(false); expect(invalid.metrics).toBeNull();
  await expect(page.getByRole('heading', { name: 'Check the circuit constraints' })).toBeVisible();
});

test('late success after an edit cannot award completion, even when undo restores that circuit', async ({ page }) => {
  await page.goto('/challenges/flip'); await add(page, 'X', 1);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let captured!: () => void; const seen = new Promise<void>(resolve => { captured = resolve; });
  await page.route('**/api/challenges/grade', async route => {
    const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
  });
  await button(page, 'Submit for grading').click(); await seen;
  await add(page, 'X', 2); await button(page, 'Undo').click(); release();
  await expect(page.getByRole('heading', { name: 'Previous feedback is stale' })).toBeVisible();
  expect((await progress(page)).flip.completedAt).toBeNull();
  await page.unroute('**/api/challenges/grade');
  expect((await submit(page)).score).toBe(100);
});

test('a late older response cannot overwrite a newer verified submission', async ({ page }) => {
  await page.goto('/challenges/flip');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let captured!: () => void; const seen = new Promise<void>(resolve => { captured = resolve; });
  let count = 0;
  await page.route('**/api/challenges/grade', async route => {
    const first = ++count === 1;
    const response = await route.fetch();
    if (first) { captured(); await gate; }
    await route.fulfill({ response }).catch(() => { /* Superseded fetch is aborted. */ });
  });
  await button(page, 'Submit for grading').click(); await seen;
  await add(page, 'X', 1); await button(page, 'Submit newer version').click();
  await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
  release();
  await expect.poll(async () => (await progress(page)).flip.best.score).toBe(100);
  await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
  expect((await progress(page)).flip.attempts).toBe(2);
});

test('backend outage and malformed snapshot responses preserve draft and never award progress; retry works', async ({ page }) => {
  await page.goto('/challenges/flip'); await add(page, 'X', 1);
  await page.route('**/api/challenges/grade', route => route.fulfill({ status: 503, body: 'Offline' }));
  await button(page, 'Submit for grading').click();
  await expect(page.getByRole('alert')).toContainText('No grade awarded');
  expect((await progress(page)).flip.completedAt).toBeNull();
  await page.unroute('**/api/challenges/grade');
  await page.route('**/api/challenges/grade', async route => {
    const response = await route.fetch(); const body = await response.json(); body.circuit.gates = [];
    await route.fulfill({ json: body });
  });
  await button(page, 'Retry grading').click();
  await expect(page.getByRole('alert')).toContainText('did not match this submission');
  expect((await progress(page)).flip.completedAt).toBeNull();
  await page.unroute('**/api/challenges/grade');
  await button(page, 'Retry grading').click();
  await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
  await expect(button(page, 'Select X gate at step 1')).toBeVisible();
});

test('catalog outage can recover and unknown challenge routes are honest', async ({ page }) => {
  await page.route('**/api/challenges', route => route.fulfill({ status: 503, body: 'Offline' }));
  await page.goto('/challenges'); await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/challenges'); await button(page, 'Retry loading challenges').click();
  await expect(page.getByRole('article')).toHaveCount(8);
  await page.goto('/challenges/does-not-exist');
  await expect(page.getByRole('heading', { name: 'That challenge is not in this collection.' })).toBeVisible();
  expect(await progress(page)).toEqual({});
});

test('free and lesson drafts, undo history and lesson progress remain isolated from challenges', async ({ page }) => {
  await page.goto('/learn/superposition'); await button(page, 'Mark as read').click();
  const lesson = await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'));
  await page.getByRole('complementary', { name: 'Application sidebar' }).getByRole('link', { name: 'Circuit Lab', exact: true }).click();
  await add(page, 'Z', 1, 1);
  const free = await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'));
  await page.getByRole('complementary', { name: 'Application sidebar' }).getByRole('link', { name: 'Challenges', exact: true }).click();
  await page.getByRole('link', { name: 'A change of bit', exact: true }).click();
  await add(page, 'X', 1); await submit(page);
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-superposition-v1'))).toBe(lesson);
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(free);
  await page.getByRole('link', { name: 'Open free exploration' }).click();
  await expect(button(page, 'Select Z gate at step 1')).toBeVisible();
  await button(page, 'Undo').click(); await expect(button(page, 'Select Z gate at step 1')).toHaveCount(0);
  await button(page, 'Redo').click(); await expect(button(page, 'Select Z gate at step 1')).toBeVisible();
  await page.getByRole('complementary', { name: 'Application sidebar' }).getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Challenge progress' })).toContainText('1 / 8 completed');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
});

for (const width of [320, 390, 768]) test(`accessible catalog and keyboard construction at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/challenges'); await expect(page.getByRole('article')).toHaveCount(8);
  await noOverflow(page); await page.screenshot({ path: info.outputPath(`catalog-${width}.png`), fullPage: true });
  await page.getByRole('link', { name: 'Two possibilities', exact: true }).click();
  const cell = button(page, 'Place gate on q0 at step 1'); await cell.focus(); await page.keyboard.press('Enter');
  await button(page, 'Submit for grading').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
  await noOverflow(page); await page.screenshot({ path: info.outputPath(`workspace-${width}.png`), fullPage: true });
  if (width <= 760) {
    await button(page, 'Open navigation').click(); await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(button(page, 'Open navigation')).toBeFocused();
  }
});

test('blocked session storage retains challenge evidence and draft through app navigation', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/challenges/flip'); await add(page, 'X', 1); await submit(page);
  await page.getByRole('link', { name: 'Back to challenges', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Completed' })).toHaveCount(1);
  await page.getByRole('link', { name: 'A change of bit', exact: true }).click();
  await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Target achieved' })).toBeVisible();
});
