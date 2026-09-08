/** Reproducible real-browser review; uses installed Chromium and local Qiskit. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5189';
const output = process.argv[3] ?? '/private/tmp/qlp-challenges-review';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a local preview URL.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const reports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { if (r.url().includes('/api/ai/')) errors.push('Unexpected AI request'); });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(`${base}/challenges`);
  await page.getByRole('article').last().waitFor();
  await page.screenshot({ path: `${output}/catalog-desktop.png`, fullPage: true, animations: 'disabled' });
  for (const id of ['flip', 'bell', 'ghz']) {
    await page.goto(`${base}/challenges/${id}`);
    await page.getByRole('heading', { name: 'Circuit Lab', exact: true }).waitFor();
    async function add(type, step, target = 0, control) {
      await button(`Choose ${type} gate`).click();
      if (control !== undefined) await button(`Place gate on q${control} at step ${step}`).click();
      await button(`Place gate on q${target} at step ${step}`).click();
    }
    await add(id === 'flip' ? 'X' : 'H', 1);
    if (id !== 'flip') await add('CX', 2, 1, 0);
    if (id === 'ghz') await add('CX', 3, 2, 1);
    const simPromise = page.waitForResponse(r => r.url().endsWith('/api/simulate'));
    await button('Run Simulation').click();
    const simulation = await (await simPromise).json();
    const gradePromise = page.waitForResponse(r => r.url().endsWith('/api/challenges/grade'));
    await button('Submit for grading').click();
    const grade = await (await gradePromise).json();
    await page.getByRole('heading', { name: 'Target achieved', exact: true }).waitFor();
    if (grade.score !== 100 || !grade.valid || !grade.targetAchieved) throw new Error(`${id} did not pass`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${id}-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.getByText('Inspect graded snapshot & evidence', { exact: true }).click();
    await page.getByRole('region', { name: 'Graded snapshot amplitudes' }).waitFor();
    const basis = await page.getByRole('region', { name: 'Graded snapshot amplitudes' }).locator('tbody th').allTextContents();
    if (basis.join() !== Array.from({ length: 2 ** simulation.numQubits }, (_, i) => `|${i.toString(2).padStart(simulation.numQubits, '0')}⟩`).join()) throw new Error('Incorrect basis display');
    const tracePromise = page.waitForResponse(r => r.url().endsWith('/api/simulate/trace'));
    await button('Explore steps').click();
    const trace = await (await tracePromise).json();
    reports.push({ id, circuit: grade.circuit, score: grade.score, metrics: grade.metrics,
      probabilities: simulation.probabilities, statevector: simulation.statevector,
      traceSteps: trace.steps.length, submissionId: grade.submissionId });
    if (id === 'bell') {
      await add('Z', 3, 1);
      const wrongPromise = page.waitForResponse(r => r.url().endsWith('/api/challenges/grade'));
      await button('Submit for grading').click();
      const wrong = await (await wrongPromise).json();
      await page.getByRole('heading', { name: 'Keep experimenting', exact: true }).waitFor();
      if (wrong.score !== 0 || wrong.metrics.totalVariationDistance > 1e-10) throw new Error('Relative phase check failed');
      await page.locator('.challenge-feedback').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/bell-wrong-phase.png`, animations: 'disabled' });
      reports.push({ id: 'bell-wrong-phase', score: wrong.score, metrics: wrong.metrics, feedback: wrong.feedback });
    }
  }
  await page.goto(`${base}/progress`);
  await page.getByRole('region', { name: 'Challenge progress' }).waitFor();
  await page.screenshot({ path: `${output}/progress-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/challenges/ghz`);
  await page.getByRole('heading', { name: 'Target achieved', exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/ghz-mobile.png`, fullPage: true, animations: 'disabled' });
  await page.goto(`${base}/challenges`);
  await page.getByRole('article').last().waitFor();
  await page.screenshot({ path: `${output}/catalog-mobile.png`, fullPage: true, animations: 'disabled' });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile document overflows');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/verified-examples.json`, JSON.stringify({ base, reports, browserErrors: errors }, null, 2));
  console.log(JSON.stringify({ base, output, examples: reports.map(r => ({ id: r.id, score: r.score, fidelity: r.metrics.fidelity, probabilityDistance: r.metrics.totalVariationDistance })), browserErrors: errors }, null, 2));
} finally { await browser.close(); }
