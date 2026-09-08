import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { foundations, foundationIds } from '../src/lesson/foundations/content';
import type { FoundationId, ExperimentDefinition } from '../src/lesson/foundations/types';
import type { SimulationRequest, SimulationResponse, TraceResponse } from '../src/api/types';

let backend: ChildProcess | undefined;
async function startBackend() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
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
const section = (page: Page, index: number) => page.getByRole('navigation', { name: 'Lesson sections' }).getByRole('button').nth(index);
const collect = (page: Page) => button(page, 'Collect experiment & return');
const guide = (page: Page) => page.getByRole('region', { name: 'Lesson experiment', exact: true });
const saved = (page: Page, id: FoundationId) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(`qlp-foundations-${key}-v1`)!).state, id);
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function nav(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    await button(page, 'Open navigation').click(); await page.getByRole('dialog').getByRole('link', { name, exact: true }).click();
  } else await page.getByRole('complementary', { name: 'Application sidebar' }).getByRole('link', { name, exact: true }).click();
}
async function place(page: Page, gate: ExperimentDefinition['gates'][number], index: number, keyboard = false) {
  await expect(page.getByRole('heading', { level: 1, name: 'Circuit Lab', exact: true })).toBeVisible();
  if (!await button(page, `Choose ${gate.type.toUpperCase()} gate`).isVisible()) await button(page, 'Gates & settings').click();
  await button(page, `Choose ${gate.type.toUpperCase()} gate`).click();
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
  const activate = async (qubit: number) => { const cell = button(page, `Place gate on q${qubit} at step ${index}`);
    if (keyboard) { await cell.focus(); await page.keyboard.press('Enter'); } else await cell.click();
  };
  if (gate.control !== undefined) await activate(gate.control);
  await activate(gate.target);
}
async function run(page: Page) {
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/simulate') && r.request().method() === 'POST');
  await button(page, 'Run Simulation').click();
  const response = await pending; expect(response.status()).toBe(200);
  const simulation = await response.json() as SimulationResponse;
  await expect(button(page, 'Run Simulation')).toBeEnabled();
  return { request: response.request().postDataJSON() as SimulationRequest, simulation };
}
async function inspect(page: Page, e: ExperimentDefinition, mobile = false) {
  const pending = page.waitForResponse((r) => r.url().endsWith('/api/simulate/trace'));
  await button(page, 'Explore steps').click(); const response = await pending;
  expect(response.status()).toBe(200); const trace = await response.json() as TraceResponse;
  expect(trace.steps).toHaveLength(e.gates.length + 1);
  for (let i = 0; i <= e.gates.length; i++) {
    if (i > 0) await button(page, 'Next step').click();
    await expect(page.locator('.trace-step-heading')).toContainText(`Step ${i} of`);
    await button(page, 'Step statevector').click();
    await expect(page.getByRole('region', { name: 'Trace statevector amplitudes' })).toBeVisible();
    if (mobile) await button(page, 'Qubit sphere').click();
    for (let q = 0; q < e.numQubits; q++) {
      await button(page, `Inspect q${q}`).click();
      await expect(page.getByTestId(`bloch-values-q${q}`)).toBeVisible();
    }
    if (mobile) await button(page, 'Joint state').click();
    if (i < e.gates.length) await expect(collect(page)).toBeDisabled();
  }
  return trace;
}
async function openExperiment(page: Page, id: FoundationId, experimentId: string, prediction = 3) {
  const lesson = foundations[id]; const e = lesson.experiments.find((item) => item.id === experimentId)!;
  await page.goto(`/learn/${id}`); await section(page, lesson.sections.findIndex((s) => s.experiment === experimentId)).click();
  await page.getByRole('radio', { name: e.prediction.options[prediction]!, exact: true }).check();
  await button(page, 'Submit prediction').click();
  await page.getByRole('link', { name: `Open Lab: ${e.title} →`, exact: true }).click();
  return e;
}
function assertScience(id: FoundationId, experiment: string, simulation: SimulationResponse, trace: TraceResponse) {
  const p = simulation.probabilities;
  const final = trace.steps.at(-1)!;
  expect(Object.values(simulation.counts).reduce((sum, count) => sum + count, 0)).toBe(simulation.shots);
  if (experiment === 'bell') {
    for (const label of ['00', '11']) expect(p[label]).toBeCloseTo(0.5, 12);
    for (const label of ['01', '10']) { expect(p[label]).toBeCloseTo(0, 12); expect(simulation.counts[label]).toBe(0); }
    expect(trace.steps[1]!.probabilities['01']).toBeCloseTo(.5, 12);
    expect(trace.steps[1]!.qubits[0]!.blochVector.x).toBeCloseTo(1, 12);
    expect(trace.steps[1]!.qubits[1]!.blochVector.z).toBeCloseTo(1, 12);
    for (const q of final.qubits) {
      expect(Math.hypot(q.blochVector.x, q.blochVector.y, q.blochVector.z)).toBeCloseTo(0, 12);
      expect(q.densityMatrix.flat().reduce((sum, z) => sum + z.real ** 2 + z.imag ** 2, 0)).toBeCloseTo(.5, 12);
    }
  } else {
    const p0 = experiment === 'h' ? .5 : experiment === 'x' || experiment === 'hzh' ? 0 : 1;
    expect(p['0']).toBeCloseTo(p0, 12); expect(p['1']).toBeCloseTo(1 - p0, 12);
    if (p0 === 0 || p0 === 1) expect(simulation.counts[p0 === 0 ? '1' : '0']).toBe(simulation.shots);
    if (id === 'phase' && experiment === 'hzh') {
      expect(trace.steps[1]!.statevector[1]!.real).toBeCloseTo(Math.SQRT1_2, 12);
      expect(trace.steps[2]!.statevector[1]!.real).toBeCloseTo(-Math.SQRT1_2, 12);
      expect(trace.steps[2]!.probabilities['0']).toBeCloseTo(.5, 12);
      expect(trace.steps[2]!.qubits[0]!.blochVector.x).toBeCloseTo(-1, 12);
      expect(final.qubits[0]!.blochVector.z).toBeCloseTo(-1, 12);
    }
  }
}

for (const id of foundationIds) for (const width of [1440, 320]) test(`${id}: direct route, free navigation and keyboard at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/learn/${id}/`);
  await expect(page.getByRole('heading', { level: 1, name: foundations[id].title, exact: true })).toBeVisible();
  for (let i = 7; i >= 0; i--) {
    await section(page, i).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: foundations[id].sections[i]!.title, exact: true })).toBeFocused();
    await noOverflow(page);
  }
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  const q = foundations[id].sections[0]!.check!;
  await expect(button(page, 'Check my answer')).toBeDisabled();
  await page.getByRole('radio', { name: q.options[q.correct], exact: true }).focus(); await page.keyboard.press('Space');
  await button(page, 'Check my answer').focus(); await page.keyboard.press('Enter');
  await expect(section(page, 0)).toContainText('Completed');
  await page.screenshot({ path: info.outputPath(`${id}-${width}.png`), fullPage: true });
});

async function journey(page: Page, id: FoundationId, mobile: boolean, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); }
  const lesson = foundations[id];
  await page.goto('/'); await nav(page, 'Learn');
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: lesson.title, exact: true }) }).getByRole('link', { name: 'Start lesson', exact: true }).click();
  const experiments: unknown[] = [];
  for (const [i, content] of lesson.sections.entries()) {
    await section(page, i).click();
    if (content.experiment) {
      const e = lesson.experiments.find((item) => item.id === content.experiment)!;
      await page.getByRole('radio', { name: e.prediction.options[3], exact: true }).check(); await button(page, 'Submit prediction').click();
      await expect(page.getByRole('status')).toContainText('Your prediction: I’m not sure');
      await section(page, 7).click(); await section(page, i).click();
      await expect(page.getByRole('radio', { name: 'I’m not sure', exact: true })).toBeChecked();
      await page.getByRole('link', { name: `Open Lab: ${e.title} →`, exact: true }).click();
      await expect(page.getByRole('button', { name: /^Select .* gate at step/ })).toHaveCount(0);
      for (const [gateIndex, gate] of e.gates.entries()) await place(page, gate, gateIndex + 1, mobile);
      const { request, simulation } = await run(page); const trace = await inspect(page, e, mobile);
      assertScience(id, e.id, simulation, trace);
      await expect(collect(page)).toBeEnabled();
      if (e.id === 'bell') {
        if (mobile) await button(page, 'Qubit sphere').click();
        await expect(page.getByTestId('bloch-values-q1')).toContainText('0.5000');
        await page.screenshot({ path: info.outputPath('bell-final-explorer.png'), fullPage: true });
      }
      await collect(page).click();
      await expect(page.getByRole('heading', { name: content.title, exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your real experiment results' })).toBeVisible();
      await button(page, 'Amplitudes').click();
      await page.getByRole('group', { name: 'Collected experiment steps' }).getByRole('button').last().click();
      await expect(page.getByRole('region', { name: 'Collected amplitudes' })).toBeVisible();
      await button(page, 'Sampled counts').click();
      for (const [label, count] of Object.entries(simulation.counts)) await expect(page.getByRole('table').getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })).toContainText(String(count));
      const archive = (await saved(page, id)).evidence[e.id];
      // JSON storage canonicalizes -0 to 0; all other returned precision is retained.
      expect(archive.request).toEqual(request); expect(archive.simulation).toEqual(JSON.parse(JSON.stringify(simulation))); expect(archive.trace).toEqual(JSON.parse(JSON.stringify(trace)));
      experiments.push({ id: e.id, request, simulation, trace });
      await page.screenshot({ path: info.outputPath(`${e.id}-collected.png`), fullPage: true });
    }
    if (content.check) {
      await page.getByRole('radio', { name: content.check.options[content.check.correct], exact: true }).check();
      await button(page, 'Check my answer').click(); await expect(section(page, i)).toContainText('Completed');
    }
    await noOverflow(page);
  }
  const answers = id === 'entanglement' ? [1, 0, 2, 1, 1] : [0, 1, 2, 1, 0];
  const groups = page.getByRole('form', { name: 'Understanding check' }).getByRole('group');
  await expect(button(page, 'Grade my answers')).toBeDisabled();
  for (let i = 0; i < answers.length; i++) await groups.nth(i).getByRole('radio').nth(answers[i]!).check();
  await button(page, 'Grade my answers').click();
  await expect(page.getByRole('region', { name: 'Lesson complete', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('region', { name: 'Lesson complete', exact: true })).toBeVisible();
  await nav(page, 'Progress');
  const record = page.getByRole('region', { name: `${lesson.title} progress`, exact: true });
  await expect(record).toContainText('8 of 8 sections completed');
  await expect(page.locator('.q-progress-numbers')).toContainText('1 / 4');
  await nav(page, 'Learn');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: lesson.title, exact: true }) });
  await expect(card.getByRole('link', { name: 'Revisit lesson' })).toBeVisible();
  await nav(page, 'Dashboard'); await expect(page.locator('.q-progress-numbers')).toContainText('1 / 4');
  if (id === 'measurement') await expect(page.locator('.q-continue')).toContainText('Superposition & the Hadamard gate');
  await info.attach('real-foundation-experiments.json', { body: JSON.stringify(experiments, null, 2), contentType: 'application/json' });
  console.log(`${id}: verified ${experiments.length} real experiments; full responses attached.`);
  expect(errors).toEqual([]);
}
for (const id of foundationIds) for (const mobile of [false, true]) test(`${id}: complete real ${mobile ? 'mobile keyboard' : 'desktop'} learning journey`, async ({ page }, info) => {
  test.setTimeout(90000); await journey(page, id, mobile, info);
});

for (const id of foundationIds) test(`${id}: deterministic grading, retries, answer visibility and quiz pass cannot replace experiments`, async ({ page }) => {
  await page.goto(`/learn/${id}`); await section(page, 7).click();
  const groups = page.getByRole('form', { name: 'Understanding check' }).getByRole('group');
  for (const group of await groups.all()) await group.getByRole('radio').first().check();
  await button(page, 'Grade my answers').click();
  await expect(page.getByRole('status')).toContainText(`${id === 'entanglement' ? 1 : 2} of 5 correct`);
  await button(page, 'Retry understanding check').click();
  await expect(page.locator('input:checked')).toHaveCount(0);
  const answers = id === 'entanglement' ? [1, 0, 2, 1, 1] : [0, 1, 2, 1, 0];
  for (let i = 0; i < 5; i++) await groups.nth(i).getByRole('radio').nth(answers[i]!).check();
  await button(page, 'Grade my answers').click(); await button(page, 'Retry understanding check').click();
  await groups.first().getByRole('radio').first().check();
  await section(page, 0).click(); await section(page, 7).click(); await page.reload();
  await expect(groups.first().getByRole('radio').first()).toBeChecked();
  await expect(section(page, 7)).toContainText('Completed');
  await expect(page.getByRole('region', { name: 'Lesson complete', exact: true })).toHaveCount(0);
  await page.getByText('Submitted quiz attempts (2)', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quiz attempt 2' })).toContainText('5 of 5 correct');
});

test('drafts, predictions, attempts, and identical H evidence stay isolated across lessons and free Lab', async ({ page }) => {
  await page.goto('/lab?workspace=free'); await place(page, { type: 'z', target: 1 }, 1);
  const e = await openExperiment(page, 'measurement', 'h', 0);
  await place(page, e.gates[0]!, 1); await run(page); await inspect(page, e); await collect(page).click();
  await page.goto('/learn/superposition');
  await section(page, 6).click(); await expect(page.getByRole('region', { name: 'Your real experiment results' })).toHaveCount(0);
  await page.goto('/lab?lesson=superposition&experiment=h');
  await expect(button(page, 'Select H gate at step 1')).toHaveCount(0);
  await expect(guide(page)).toContainText('Start with a prediction'); await expect(collect(page)).toHaveCount(0);
  await page.goto('/lab?lesson=phase&experiment=hh'); await place(page, { type: 'x', target: 0 }, 1);
  await page.goto('/lab?lesson=measurement&experiment=h'); await expect(button(page, 'Select H gate at step 1')).toBeVisible();
  await expect(guide(page)).toContainText('Your recorded prediction: Always 0'); await expect(collect(page)).toBeDisabled();
  await page.getByRole('link', { name: 'Open free exploration' }).click(); await expect(button(page, 'Select Z gate at step 1')).toBeVisible();
  await page.goto('/lab?lesson=phase&experiment=hh'); await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await expect(guide(page)).toContainText('Submit your prediction');
  expect((await saved(page, 'measurement')).evidence.h.lessonId).toBe('measurement');
  expect((await saved(page, 'phase')).evidence).toEqual({});
  await page.goto('/lab?lesson=phase&experiment=bell'); await expect(guide(page)).toHaveCount(0);
});

test('wrong order, extra gates, wrong control and target never satisfy the Bell requirement', async ({ page }) => {
  const e = await openExperiment(page, 'entanglement', 'bell');
  // The reverse orientation still makes the same final Bell probabilities, but is not this exercise.
  await place(page, { type: 'h', target: 1 }, 1); await place(page, { type: 'cx', control: 1, target: 0 }, 2);
  const wrong = await run(page); expect(wrong.simulation.probabilities['11']).toBeCloseTo(.5, 12);
  await inspect(page, e); await expect(collect(page)).toBeDisabled();
  await button(page, 'Start over with two empty qubits').click();
  await place(page, e.gates[1]!, 1); await place(page, e.gates[0]!, 2);
  await run(page); await inspect(page, e); await expect(collect(page)).toBeDisabled();
  await button(page, 'Start over with two empty qubits').click();
  for (const [i, gate] of e.gates.entries()) await place(page, gate, i + 1);
  await run(page); await inspect(page, e); await expect(collect(page)).toBeEnabled();
  await place(page, { type: 'z', target: 0 }, 3); await expect(collect(page)).toBeDisabled();
});

test('stale gates, qubit count, unapplied shots, seed and request IDs cannot reuse evidence', async ({ page }) => {
  const e = await openExperiment(page, 'measurement', 'h'); await place(page, e.gates[0]!, 1);
  await run(page); await inspect(page, e); await expect(collect(page)).toBeEnabled();
  await page.getByLabel('Shots', { exact: true }).fill('2048'); await expect(collect(page)).toBeDisabled();
  await button(page, 'Apply shots').click(); await expect(collect(page)).toBeDisabled();
  await button(page, 'Undo').click(); await expect(collect(page)).toBeEnabled();
  await button(page, 'Add qubit').click(); await expect(collect(page)).toBeDisabled();
  await button(page, 'Undo').click(); await expect(collect(page)).toBeEnabled();
  await page.getByLabel('Load template', { exact: true }).selectOption('h'); await expect(collect(page)).toBeDisabled();
  await run(page); await expect(collect(page)).toBeDisabled(); await inspect(page, e); await expect(collect(page)).toBeEnabled();
  await page.route('**/api/simulate', async (route) => { const response = await route.fetch(); const body = await response.json(); body.metadata.seedSimulator += 1; await route.fulfill({ response, json: body }); });
  await button(page, 'Run Simulation').click(); await expect(page.getByRole('alert')).toContainText('does not match');
  await expect(collect(page)).toBeDisabled();
});

test('real backend outage clears prior evidence eligibility and supports recovery', async ({ page }) => {
  test.setTimeout(60000);
  const e = await openExperiment(page, 'phase', 'hzh');
  for (const [i, gate] of e.gates.entries()) await place(page, gate, i + 1);
  await run(page); await inspect(page, e); await expect(collect(page)).toBeEnabled();
  await stopBackend();
  try {
    await button(page, 'Run Simulation').click(); await expect(page.getByRole('alert')).toContainText('API unavailable');
    await expect(collect(page)).toBeDisabled(); await button(page, 'Explore steps').click();
    await expect(page.getByRole('alert')).toContainText('Trace could not complete');
    await expect(collect(page)).toBeDisabled(); expect((await saved(page, 'phase')).evidence).toEqual({});
  } finally { await startBackend(); }
  await run(page); await inspect(page, e); await expect(collect(page)).toBeEnabled(); await collect(page).click();
  await expect(page.getByRole('region', { name: 'Your real experiment results' })).toBeVisible();
});

test('late responses cannot label an edited circuit as current', async ({ page }) => {
  const e = await openExperiment(page, 'phase', 'hh'); for (const [i, gate] of e.gates.entries()) await place(page, gate, i + 1);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let fetched!: () => void; const ready = new Promise<void>((resolve) => { fetched = resolve; });
  await page.route('**/api/simulate', async (route) => { const response = await route.fetch(); fetched(); await gate; await route.fulfill({ response }); });
  await button(page, 'Run Simulation').click(); await ready;
  try {
    await button(page, 'Choose Z gate').click(); await page.getByText('Add gate with form', { exact: true }).click();
    await page.getByLabel('Insert position', { exact: true }).selectOption('1'); await button(page, 'Add gate').click();
  } finally { release(); }
  await expect(button(page, 'Run Simulation')).toBeEnabled(); await expect(collect(page)).toBeDisabled();
  await button(page, 'Results').isVisible().then(async (visible) => { if (visible) await button(page, 'Results').click(); });
  await expect(page.getByText('Results are stale', { exact: false })).toBeVisible();
});

test('malformed stored state and cross-lesson copied evidence are rejected without crashing', async ({ page }) => {
  const e = await openExperiment(page, 'measurement', 'h'); await place(page, e.gates[0]!, 1); await run(page); await inspect(page, e); await collect(page).click();
  await page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem('qlp-foundations-measurement-v1')!);
    value.state.evidence.h.lessonId = 'phase';
    value.state.drafts.h = { numQubits: 8, gates: null };
    value.state.stage = 800; value.state.visited = [null, -1, 800];
    sessionStorage.setItem('qlp-foundations-measurement-v1', JSON.stringify(value));
    sessionStorage.setItem('qlp-foundations-phase-v1', '{bad json');
  });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Information starts with a choice', exact: true })).toBeVisible();
  expect((await saved(page, 'measurement')).evidence).toEqual({});
  await page.goto('/lab?lesson=measurement&experiment=h'); await expect(button(page, 'Select H gate at step 1')).toHaveCount(0);
  await page.goto('/learn/phase'); await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
});

test('new lesson progress and draft survive client navigation when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto('/'); await page.getByRole('link', { name: 'Start your quantum journey' }).click();
  await page.getByRole('radio', { name: 'The door is closed.', exact: true }).check(); await button(page, 'Check my answer').click();
  await section(page, 3).click(); await page.getByRole('link', { name: 'Open Lab: Prepare one with X →' }).click(); await place(page, { type: 'x', target: 0 }, 1);
  await nav(page, 'Dashboard'); await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await nav(page, 'Circuit Lab'); await expect(button(page, 'Select X gate at step 1')).toBeVisible();
  await guide(page).getByRole('link', { name: 'Return to lesson' }).click(); await expect(section(page, 0)).toContainText('Completed');
});

test('concept diagrams explain sign changes and bit order without granting experiment credit', async ({ page }) => {
  await page.goto('/learn/phase'); await button(page, 'Reverse only the one amplitude').click();
  await expect(page.getByRole('status')).toContainText('Opposite signs');
  await section(page, 2).click(); await button(page, 'Reverse both signs').click();
  await expect(page.locator('.foundation-visual')).toContainText('every physical prediction is unchanged');
  await section(page, 5).click(); await button(page, 'H → Z → H').click();
  await expect(page.locator('.foundation-visual')).toContainText('½ − ½ = 0');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.goto('/learn/entanglement'); await button(page, 'Change q0, currently 0').click();
  await expect(page.getByRole('status')).toHaveText('|01⟩');
  await button(page, 'Change q1, currently 0').click(); await expect(page.getByRole('status')).toHaveText('|11⟩');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
});

test('submitted attempts stay in their lesson across client navigation and a fresh tab has no progress', async ({ page, context }) => {
  await page.goto('/learn/phase'); await section(page, 7).click();
  for (const group of await page.getByRole('form', { name: 'Understanding check' }).getByRole('group').all()) await group.getByRole('radio').first().check();
  await button(page, 'Grade my answers').click();
  await page.getByRole('link', { name: '← All lessons' }).click();
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Qubits and measurement', exact: true }) }).getByRole('link', { name: 'Start lesson', exact: true }).click();
  await section(page, 7).click(); await expect(page.locator('input:checked')).toHaveCount(0);
  expect((await saved(page, 'measurement')).quizAttempts).toEqual([]);
  expect((await saved(page, 'phase')).quizAttempts).toHaveLength(1);
  await page.goBack(); await page.goBack();
  await expect(page.getByRole('status')).toContainText('2 of 5 correct');
  const fresh = await context.newPage(); await fresh.goto('/learn/phase');
  await expect(fresh.getByRole('progressbar')).toHaveAttribute('value', '0'); await fresh.close();
});

test('failed trace retry resets step inspections and a wrong intermediate phase cannot count as evidence', async ({ page }) => {
  const e = await openExperiment(page, 'phase', 'hzh'); for (const [i, gate] of e.gates.entries()) await place(page, gate, i + 1);
  await run(page); await inspect(page, e); await expect(collect(page)).toBeEnabled();
  await page.route('**/api/simulate/trace', async (route) => {
    const response = await route.fetch(); const body = await response.json();
    // Deliberately corrupt a real response for this negative test.
    body.steps[2].gate.id = 'unrelated-execution'; await route.fulfill({ response, json: body });
  });
  await button(page, 'Trace circuit').click(); await expect(page.getByRole('alert')).toContainText('does not match the trace contract');
  await expect(collect(page)).toBeDisabled();
  await page.unroute('**/api/simulate/trace');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/simulate/trace'));
  await button(page, 'Retry trace').click(); await response;
  await expect(page.locator('.trace-step-heading')).toContainText('Step 0 of 3'); await expect(collect(page)).toBeDisabled();
  for (let i = 0; i < 3; i++) await button(page, 'Next step').click();
  await expect(collect(page)).toBeEnabled();
  await page.route('**/api/simulate/trace', async (route) => {
    const response = await route.fetch(); const body = await response.json();
    // Wrong but internally normalized intermediate state with the same probabilities.
    body.steps[2].statevector = body.steps[1].statevector;
    body.steps[2].qubits = body.steps[1].qubits;
    await route.fulfill({ response, json: body });
  });
  await inspect(page, e); await expect(collect(page)).toBeDisabled();
  expect((await saved(page, 'phase')).evidence).toEqual({});
});

test('real H samples reproduce with one seed and vary with a different seed while ideal probabilities agree', async ({ page }, info) => {
  const e = await openExperiment(page, 'measurement', 'h'); await place(page, e.gates[0]!, 1);
  const original = await run(page); const replay = await run(page);
  expect(replay.simulation.counts).toEqual(original.simulation.counts);
  // Exercise the same existing API with another sampling seed; this is not collected lesson evidence.
  const response = await page.request.post('/api/simulate', { data: { ...original.request, seedSimulator: 43 } });
  expect(response.status()).toBe(200); const changed = await response.json() as SimulationResponse;
  expect(changed.counts).not.toEqual(original.simulation.counts);
  expect(changed.probabilities['0']).toBeCloseTo(original.simulation.probabilities['0']!, 12);
  await info.attach('real-sampling-comparison.json', { body: JSON.stringify({ seed42: original.simulation.counts, seed43: changed.counts }), contentType: 'application/json' });
  console.log('Real H sampling comparison:', JSON.stringify({ seed42: original.simulation.counts, seed43: changed.counts }));
  await expect(collect(page)).toBeDisabled();
});
