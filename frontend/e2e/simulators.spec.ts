import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SimulationRequest, SimulationResponse, SimulatorBackend, TraceResponse } from '../src/api/types';
import type { AlgorithmRun } from '../src/algorithms/types';
import { validTrace } from '../src/api/traceClient';
import { isSimulationResponse } from '../src/api/client';
import { codeTemplates } from '../src/lab/circuitCode';

let backend: ChildProcess | undefined;
test.beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve())); });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), env: { ...process.env, QLP_AI_ENABLED: 'false', QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  backend.stdout?.on('data', () => {});
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
const selector = (page: Page) => page.getByLabel('Simulator', { exact: true });
const saved = (page: Page): Promise<SimulationRequest> => page.evaluate(() => JSON.parse(sessionStorage.getItem('qlp-circuit-free-v1') ?? 'null'));
const resultRegion = (page: Page) => page.getByRole('region', { name: 'Lab simulation results', exact: true });
async function code(page: Page, kind: keyof typeof codeTemplates) {
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
  await button(page, 'Code').click();
  await page.getByLabel('Code template', { exact: true }).selectOption(kind);
  await button(page, 'Apply code').click();
  await expect(page.getByRole('status').filter({ hasText: 'Code matches the applied circuit' })).toBeVisible();
}
async function run(page: Page, engine: SimulatorBackend) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/simulate'));
  await button(page, 'Run Simulation').click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json() as SimulationResponse;
  expect(body.backend).toBe(engine); expect(isSimulationResponse(body)).toBe(true);
  expect(response.request().postDataJSON().backend).toBe(engine);
  await expect(page.getByTestId('result-backend')).toContainText(engine === 'qiskit' ? 'Qiskit Aer' : 'PennyLane · default.qubit');
  await expect(page.locator('.lab-toolbar-status')).toHaveText('Current');
  return body;
}
async function trace(page: Page, engine: SimulatorBackend) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/simulate/trace'));
  await button(page, 'Explore steps').click();
  const response = await pending; expect(response.status()).toBe(200);
  const body = await response.json() as TraceResponse;
  expect(body.backend).toBe(engine);
  expect(validTrace(body, response.request().postDataJSON())).toBe(true);
  await expect(page.getByTestId('trace-backend')).toContainText(engine === 'qiskit' ? 'Qiskit Aer' : 'PennyLane · default.qubit');
  for (let i = 1; i < body.steps.length; i++) await button(page, 'Next step').click();
  return body;
}
async function resultJSON(page: Page): Promise<SimulationResponse> {
  const details = resultRegion(page).locator('details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return JSON.parse(await page.getByLabel('Result snapshot response JSON', { exact: true }).innerText());
}
function equalPhysical(a: SimulationResponse, b: SimulationResponse) {
  for (const [label, p] of Object.entries(a.probabilities)) expect(b.probabilities[label]).toBeCloseTo(p, 12);
  // Magnitude squared of the complex overlap, invariant under global phase.
  let real = 0, imag = 0;
  a.statevector.forEach((x, i) => {
    const y = b.statevector[i]!;
    real += x.real * y.real + x.imag * y.imag;
    imag += x.real * y.imag - x.imag * y.real;
  });
  expect(real * real + imag * imag).toBeCloseTo(1, 12);
}

for (const width of [1440, 390]) for (const kind of ['h', 'bell', 'rotation', 'ccx'] as const) {
  test(`real ${kind} walkthrough at ${width}px: same draft, both engines, trace and purity`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/lab?workspace=free'); await expect(selector(page)).toHaveValue('qiskit');
    await code(page, kind); await button(page, 'Circuit editor').click();
    const original = await saved(page);
    const qiskit = await run(page, 'qiskit');
    const qtrace = await trace(page, 'qiskit');
    await selector(page).selectOption('pennylane');
    await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toBeVisible();
    await expect(page.getByTestId('bloch-endpoint')).toHaveCount(0);
    expect(await saved(page)).toEqual({ ...original, backend: 'pennylane' });
    const pennylane = await run(page, 'pennylane');
    equalPhysical(qiskit, pennylane);
    const expected = kind === 'ccx' ? [0,0,0,0,0,0,0,1] : kind === 'bell' ? [.5,0,0,.5] : [.5,.5];
    expected.forEach((p, i) => expect(pennylane.probabilities[i.toString(2).padStart(original.numQubits,'0')]).toBeCloseTo(p,12));
    expect(Object.values(pennylane.counts).reduce((a,b) => a+b, 0)).toBe(1024);
    expect(pennylane.metadata).toMatchObject({ engine:'pennylane.default.qubit', pennylaneVersion:'0.45.1', seedSimulator:42 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${kind}-${width}-results.png`), fullPage: true });
    const ptrace = await trace(page, 'pennylane');
    expect(ptrace.steps.length).toBe(qtrace.steps.length);
    if (width === 390) await button(page, 'Qubit sphere').click();
    const purity = kind === 'bell' ? '0.5000' : '1.0000';
    await expect(page.getByTestId('bloch-values-q0')).toContainText(purity);
    if (kind === 'bell') await expect(page.getByText('Maximally mixed', { exact:true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${kind}-${width}-trace.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await selector(page).selectOption('qiskit');
    expect(await saved(page)).toEqual(original);
    equalPhysical(await run(page, 'qiskit'), pennylane);
    await info.attach(`${kind}-real-executions.json`, { body:JSON.stringify({ original,qiskit,pennylane,qtrace,ptrace }), contentType:'application/json' });
    expect(errors).toEqual([]);
  });
}

test('visual SWAP at 320px preserves least-significant q0 ordering and keyboard selection', async ({ page }, info) => {
  await page.setViewportSize({ width:320, height:844 }); await page.goto('/lab?workspace=free');
  await selector(page).focus(); await page.keyboard.press('p'); await page.keyboard.press('Enter');
  await expect(selector(page)).toHaveValue('pennylane');
  await button(page,'Gates & settings').click(); await button(page,'Choose X gate').click();
  await button(page,'Circuit').click(); await button(page,'Place gate on q0 at step 1').click();
  const first = await run(page,'pennylane'); expect(first.probabilities['01']).toBeCloseTo(1,12);
  await button(page,'Gates & settings').click(); await button(page,'Choose SWAP gate').click();
  await button(page,'Circuit').click(); await button(page,'Place gate on q0 at step 2').click();
  await button(page,'Place gate on q1 at step 2').click();
  const swapped = await run(page,'pennylane'); expect(swapped.counts['10']).toBe(1024);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path:info.outputPath('swap-320.png'), fullPage:true });
});

for (const endpoint of ['/api/simulate', '/api/simulate/trace']) for (const initial of ['qiskit','pennylane'] as const) {
  test(`late ${initial} ${endpoint} response cannot overwrite newer backend results`, async ({ page }) => {
    await page.goto('/lab?workspace=free'); await code(page,'bell'); await selector(page).selectOption(initial);
    let release!: () => void; const held = new Promise<void>(resolve => { release=resolve; });
    let ready=false, delivered=false, first=true;
    await page.route(`**${endpoint}`, async route => {
      if (!first) { await route.continue(); return; }
      first=false;
      const real = await route.fetch(); ready=true; await held;
      try { await route.fulfill({ response:real }); } catch { /* Cancelled fetch: expected. */ }
      delivered=true;
    });
    try {
      await button(page,endpoint.endsWith('trace') ? 'Explore steps' : 'Run Simulation').click();
      await expect.poll(() => ready).toBe(true);
      const next = initial === 'qiskit' ? 'pennylane' : 'qiskit';
      await selector(page).selectOption(next);
      if (endpoint.endsWith('trace')) {
        const newer = await trace(page,next); release(); await expect.poll(() => delivered).toBe(true);
        await page.getByText('Trace Details',{ exact:true }).click();
        expect(JSON.parse(await page.getByLabel('Trace response JSON',{ exact:true }).innerText())).toEqual(newer);
      } else {
        const newer = await run(page,next); release(); await expect.poll(() => delivered).toBe(true);
        expect(await resultJSON(page)).toEqual(newer);
      }
    } finally { release(); }
  });
}

test('backend, gates, IDs, settings, undo and pending code survive navigation and reload', async ({ page }) => {
  await page.goto('/lab?workspace=free'); await code(page,'bell');
  const original=await saved(page);
  const editor=page.getByLabel('OpenQASM source',{exact:true});
  const pending=await editor.inputValue()+'\n// unfinished student note\n'; await editor.fill(pending);
  await selector(page).selectOption('pennylane');
  expect(await saved(page)).toEqual({...original,backend:'pennylane'});
  await expect(editor).toHaveValue(pending); await expect(button(page,'Apply code')).toBeVisible();
  await button(page,'Undo').click(); await expect(selector(page)).toHaveValue('qiskit');
  await button(page,'Redo').click(); await expect(selector(page)).toHaveValue('pennylane');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Dashboard',exact:true}).click();
  await page.goBack(); await button(page,'Code').click();
  await expect(selector(page)).toHaveValue('pennylane'); await expect(editor).toHaveValue(pending);
  await page.reload(); await button(page,'Code').click();
  expect(await saved(page)).toEqual({...original,backend:'pennylane'}); await expect(editor).toHaveValue(pending);
  await button(page,'Apply code').click(); await run(page,'pennylane');
  await page.getByLabel('Load template',{exact:true}).selectOption('h');
  await expect(selector(page)).toHaveValue('pennylane');
  await button(page,'Undo').click(); expect(await saved(page)).toEqual({...original,backend:'pennylane'});
});

for (const endpoint of ['/api/simulate','/api/simulate/trace']) {
  test(`a real response from the wrong backend is rejected for ${endpoint}`, async ({ page }) => {
    await page.goto('/lab?workspace=free'); await code(page,'h'); await selector(page).selectOption('pennylane');
    await page.route(`**${endpoint}`, async route => {
      const real = await route.fetch({ postData:JSON.stringify({...route.request().postDataJSON(),backend:'qiskit'}) });
      await route.fulfill({ response:real });
    });
    await button(page,endpoint.endsWith('trace') ? 'Explore steps' : 'Run Simulation').click();
    await expect(page.getByRole('alert')).toContainText('does not match');
    await expect(page.getByTestId(endpoint.endsWith('trace') ? 'trace-backend' : 'result-backend')).toHaveCount(0);
    await page.unroute(`**${endpoint}`);
    if (endpoint.endsWith('trace')) await trace(page,'pennylane'); else await run(page,'pennylane');
  });
}

test('metadata validators reject relabelled Qiskit results as PennyLane', async ({ request }) => {
  const body: SimulationRequest={numQubits:1,gates:[],shots:1,backend:'qiskit',seedSimulator:0};
  const sim=await (await request.post('/api/simulate',{data:body})).json();
  const traced=await (await request.post('/api/simulate/trace',{data:body})).json();
  expect(isSimulationResponse({...sim,backend:'pennylane'})).toBe(false);
  expect(isSimulationResponse({...sim,metadata:{...sim.metadata,engine:'pennylane.default.qubit'}})).toBe(false);
  expect(validTrace({...traced,backend:'pennylane'},{...body,backend:'pennylane'})).toBe(false);
});

for (const algorithm of ['grover','deutsch-jozsa']) {
  test(`${algorithm} uses both backends with unchanged built gates and interpretation`, async ({ page }) => {
    await page.goto(`/algorithms/${algorithm}`);
    async function algorithmRun() {
      await expect(page.getByRole('heading',{name:'Generated circuit',exact:true})).toBeVisible();
      await page.getByRole('radio',{name:'I’m not sure yet',exact:true}).check();
      await button(page,'Submit prediction').click();
      const pending=page.waitForResponse(r=>r.url().endsWith('/api/algorithms/run'));
      await button(page,'Run algorithm').click(); const response=await pending; expect(response.status()).toBe(200);
      await expect(page.getByTestId('algorithm-conclusion')).toBeVisible();
      return await response.json() as AlgorithmRun;
    }
    const first=await algorithmRun();
    await selector(page).selectOption('pennylane'); await expect(page.getByTestId('algorithm-conclusion')).toHaveCount(0);
    const next=await algorithmRun();
    expect(next.definition.circuit.gates).toEqual(first.definition.circuit.gates);
    equalPhysical(first.simulation,next.simulation);
    await expect(page.getByTestId('algorithm-backend')).toContainText('PennyLane');
    await page.reload(); await expect(selector(page)).toHaveValue('pennylane');
  });
}

test('PennyLane Lab challenge execution retains Qiskit grading and the free draft', async ({ page }) => {
  await page.goto('/lab?workspace=free'); await code(page,'bell'); const free=await saved(page);
  await page.goto('/challenges/flip'); await selector(page).selectOption('pennylane');
  await button(page,'Choose X gate').click(); await button(page,'Place gate on q0 at step 1').click();
  expect((await run(page,'pennylane')).probabilities['1']).toBeCloseTo(1,12);
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/challenges/grade'));
  await button(page,'Submit for grading').click(); const grade=await (await pending).json();
  expect(grade.engine).toBe('qiskit-aer-statevector'); expect(grade.score).toBe(100);
  await expect(page.getByRole('heading',{name:'Target achieved',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Open free exploration',exact:true}).click();
  expect(await saved(page)).toEqual(free); await expect(selector(page)).toHaveValue('qiskit');
});
