/** Real local-browser evidence; no mocked parser, simulator, or trace results. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5180';
const output = process.argv[3] ?? '/private/tmp/qlp-expanded-review';
const origin = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.protocol !== 'http:') throw new Error('Use a local HTTP preview URL.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const expectedValidationLogs = [];
let expectingInvalidCode = false;
const examples = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (expectingInvalidCode && m.location().url.endsWith('/api/circuits/parse') && m.text().includes('422')) expectedValidationLogs.push(m.text());
    else errors.push(m.text());
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const editor = page.getByRole('textbox', { name: 'OpenQASM source', exact: true });
  await page.goto(`${base}/lab?workspace=free`);
  await expect(button('Code')).toBeVisible();
  await button('Remove qubit').click();
  await button('Place gate on q0 at step 1').click();
  for (const id of ['h', 'bell', 'rotation', 'ccx']) {
    await button('Code').click();
    if (id !== 'h') {
      await page.getByLabel('Code template', { exact: true }).selectOption(id);
      const parsed = page.waitForResponse(r => r.url().endsWith('/api/circuits/parse'));
      await button('Apply code').click(); expect((await parsed).status()).toBe(200);
      await expect(page.getByRole('status').filter({ hasText: 'Code matches the applied circuit' })).toBeVisible();
    }
    const source = await editor.inputValue();
    const run = page.waitForResponse(r => r.url().endsWith('/api/simulate'));
    await button('Run Simulation').click();
    const simulated = await run; expect(simulated.status()).toBe(200);
    const circuit = simulated.request().postDataJSON();
    const simulation = await simulated.json();
    const expected = id === 'ccx' ? [0, 0, 0, 0, 0, 0, 0, 1] : id === 'bell' ? [.5, 0, 0, .5] : [.5, .5];
    for (const [index, probability] of expected.entries()) {
      expect(simulation.probabilities[index.toString(2).padStart(circuit.numQubits, '0')]).toBeCloseTo(probability, 12);
    }
    expect(simulation.metadata).toMatchObject({ qiskitVersion: '2.5.2', aerVersion: '0.17.2' });
    const traced = page.waitForResponse(r => r.url().endsWith('/api/simulate/trace'));
    await button('Explore steps').click();
    const response = await traced; expect(response.status()).toBe(200);
    const trace = await response.json();
    expect(trace.steps.length).toBe(circuit.gates.length + 1);
    for (const [index, amplitude] of trace.steps.at(-1).statevector.entries()) {
      expect(amplitude.real).toBeCloseTo(simulation.statevector[index].real, 12);
      expect(amplitude.imag).toBeCloseTo(simulation.statevector[index].imag, 12);
    }
    await button('Code').click();
    await page.locator('.lab-workspace').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${output}/${id}-canvas-desktop.png`, fullPage: true });
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${id}-code-desktop.png`, fullPage: true });
    examples.push({ id, source, circuit, simulation, trace });
  }
  const before = await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'));
  const source = await editor.inputValue();
  await editor.fill(source + '\nrx(pi/0) q[0];\n');
  expectingInvalidCode = true;
  const rejected = page.waitForResponse(r => r.url().endsWith('/api/circuits/parse'));
  await button('Apply code').click();
  const rejection = await rejected; expect(rejection.status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText('division by zero');
  expect(await page.evaluate(() => sessionStorage.getItem('qlp-circuit-free-v1'))).toBe(before);
  await page.screenshot({ path: `${output}/invalid-code-desktop.png`, fullPage: true });
  const diagnostics = await rejection.json();
  expectingInvalidCode = false;
  await button('Discard code edits').click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    if (await button('Circuit').isVisible()) await button('Circuit').click();
    await button('Code').click();
    await page.getByText('Supported syntax & phase conventions', { exact: true }).click();
    await page.getByText('Qiskit Python example · read only', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/ccx-code-${width}px.png`, fullPage: true });
    await page.getByText('Supported syntax & phase conventions', { exact: true }).click();
    await page.getByText('Qiskit Python example · read only', { exact: true }).click();
  }
  expect(errors).toEqual([]);
  const report = { base, verifiedAt: new Date().toISOString(), examples, invalidCode: { ...diagnostics, circuitPreserved: true }, expectedValidationLogs, browserErrors: errors };
  await writeFile(`${output}/verified-examples.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ base, output, examples: examples.map(({ id, simulation }) => ({ id, probabilities: simulation.probabilities, statevector: simulation.statevector })), invalidCode: report.invalidCode, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
