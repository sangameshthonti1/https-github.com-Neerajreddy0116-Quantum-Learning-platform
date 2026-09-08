import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Gate, SimulationRequest, SimulationResponse, TraceResponse } from '../src/api/types';
import { codeTemplates, reconcileGateIds, toOpenQasm, toQiskitPython } from '../src/lab/circuitCode';
import { arity, gateMeaning, gateTypes, makeGate } from '../src/lab/gates';
import { circuitKey, editorReducer, validCircuitDraft } from '../src/lab/useCircuitEditor';
import { validTrace } from '../src/api/traceClient';

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

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const sourceEditor = (page: Page) => page.getByRole('textbox', { name: 'OpenQASM source', exact: true });
const saved = (page: Page): Promise<SimulationRequest> => page.evaluate(() => JSON.parse(sessionStorage.getItem('qlp-circuit-free-v1') ?? 'null'));
const blank: SimulationRequest = { numQubits: 2, gates: [], shots: 1024, backend: 'qiskit', seedSimulator: 42 };

async function openCode(page: Page) {
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
  await button(page, 'Code').click();
}
async function apply(page: Page, name = 'Apply code') {
  const response = page.waitForResponse(r => r.url().endsWith('/api/circuits/parse'));
  await button(page, name).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Code matches the applied circuit' })).toBeVisible();
}
async function run(page: Page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/simulate'));
  await button(page, 'Run Simulation').click();
  const result = await response; expect(result.status()).toBe(200);
  return { request: result.request().postDataJSON() as SimulationRequest, response: await result.json() as SimulationResponse };
}
async function trace(page: Page) {
  if (await button(page, 'Circuit').isVisible()) await button(page, 'Circuit').click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/simulate/trace'));
  await button(page, 'Explore steps').click();
  const result = await response; expect(result.status()).toBe(200);
  return await result.json() as TraceResponse;
}

for (const mobile of [false, true]) for (const kind of ['h', 'bell', 'rotation', 'ccx'] as const) {
  test(`real ${mobile ? 'mobile' : 'desktop'} ${kind}: code, canvas, Aer and trace agree`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto('/lab?workspace=free');
    await openCode(page);
    await page.getByLabel('Code template', { exact: true }).selectOption(kind);
    expect((await saved(page)).gates).toHaveLength(0);
    await apply(page);
    const circuit = await saved(page);
    expect(circuit.gates.length).toBe(kind === 'bell' ? 2 : kind === 'ccx' ? 3 : 1);
    if (kind === 'ccx') {
      await expect(button(page, 'Select CCX control q0 at step 3')).toBeVisible();
      await expect(button(page, 'Select CCX control q1 at step 3')).toBeVisible();
      await expect(button(page, 'Select CCX target q2 at step 3')).toBeVisible();
    } else if (kind === 'bell') await expect(button(page, 'Select CX target q1 at step 2')).toBeVisible();
    else await expect(button(page, `Select ${kind === 'h' ? 'H' : 'RY'} gate at step 1`)).toBeVisible();
    const result = await run(page);
    expect(result.request).toEqual(circuit);
    const expected = kind === 'ccx' ? [0, 0, 0, 0, 0, 0, 0, 1] : kind === 'bell' ? [.5, 0, 0, .5] : [.5, .5];
    for (const [i, p] of expected.entries()) expect(result.response.probabilities[i.toString(2).padStart(circuit.numQubits, '0')]).toBeCloseTo(p, 12);
    expect(Object.values(result.response.counts).reduce((a, b) => a + b, 0)).toBe(1024);
    expect(result.response.metadata).toMatchObject({ qiskitVersion: '2.5.2', aerVersion: '0.17.2', statevectorStage: 'before-measurement' });
    const traced = await trace(page);
    expect(validTrace(traced, circuit)).toBe(true);
    for (const [i, a] of traced.steps.at(-1)!.statevector.entries()) {
      expect(a.real).toBeCloseTo(result.response.statevector[i]!.real, 12);
      expect(a.imag).toBeCloseTo(result.response.statevector[i]!.imag, 12);
    }
    await openCode(page);
    await expect(sourceEditor(page)).toHaveValue(toOpenQasm(circuit));
    await page.getByText('Qiskit Python example · read only', { exact: true }).click();
    await expect(page.getByLabel('Read-only Qiskit Python example')).toContainText(`qc.${kind === 'rotation' ? 'ry' : kind === 'bell' ? 'cx' : kind}(`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${kind}-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('visual/code round trip preserves IDs, applies one undoable edit and invalidates results and trace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free');
  await button(page, 'Remove qubit').click();
  await button(page, 'Place gate on q0 at step 1').click();
  const original = await saved(page);
  await run(page); await trace(page); await openCode(page);
  const generated = await sourceEditor(page).inputValue();
  await sourceEditor(page).fill(generated + '\n// only formatting changed\n'); await apply(page);
  expect(await saved(page)).toEqual(original);
  await sourceEditor(page).fill(generated + '\nrz(pi/2) q[0];\n'); await apply(page);
  const edited = await saved(page);
  expect(edited.gates[0]!.id).toBe(original.gates[0]!.id);
  expect(edited.gates[1]!.params).toEqual([Math.PI / 2]);
  await expect(page.getByRole('status').filter({ hasText: 'Results are stale' })).toBeVisible();
  await button(page, 'State Explorer').click();
  await expect(page.getByRole('status').filter({ hasText: 'Trace is stale' })).toBeVisible();
  await openCode(page); await button(page, 'Undo').click();
  expect(await saved(page)).toEqual(original);
  await expect(sourceEditor(page)).toHaveValue(generated);
  await button(page, 'Redo').click(); expect(await saved(page)).toEqual(edited);
  await expect(sourceEditor(page)).toHaveValue(toOpenQasm(edited));
});

test('invalid code leaves the working circuit intact; diagnostics, keyboard, discard and navigation retain drafts', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/lab?workspace=free');
  await openCode(page); await page.getByLabel('Code template').selectOption('bell'); await apply(page);
  const original = await saved(page);
  const invalid = codeTemplates.bell.source + 'rx(pi/0) q[0];\n';
  await sourceEditor(page).fill(invalid);
  await sourceEditor(page).focus(); await page.keyboard.press('Tab');
  await expect(button(page, 'Apply code')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('division by zero');
  expect(await saved(page)).toEqual(original);
  await expect(sourceEditor(page)).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: /^Line \d+, column \d+$/ }).click();
  await expect(sourceEditor(page)).toBeFocused();
  await page.screenshot({ path: info.outputPath('invalid-code-mobile.png'), fullPage: true });
  await page.reload(); await openCode(page); await expect(sourceEditor(page)).toHaveValue(invalid);
  await button(page, 'Open navigation').click(); await page.getByRole('dialog').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await button(page, 'Open navigation').click(); await page.getByRole('dialog').getByRole('link', { name: 'Circuit Lab', exact: true }).click();
  await openCode(page); await expect(sourceEditor(page)).toHaveValue(invalid);
  expect(await saved(page)).toEqual(original);
  await button(page, 'Discard code edits').click(); await expect(sourceEditor(page)).toHaveValue(toOpenQasm(original));
  expect(await saved(page)).toEqual(original);
});

test('angle presets, validation, placement and parameter edits keep real simulation synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free');
  await button(page, 'Remove qubit').click(); await button(page, 'Choose RX gate').click();
  await page.getByRole('spinbutton', { name: 'Angle (radians)', exact: true }).fill('');
  await button(page, 'Place gate on q0 at step 1').click();
  expect((await saved(page)).gates).toHaveLength(0);
  await expect(page.getByRole('alert')).toContainText('finite angle');
  await button(page, '−π/2').click(); await button(page, 'Place gate on q0 at step 1').click();
  const original = await saved(page); expect(original.gates[0]!.params).toEqual([-Math.PI / 2]);
  const result = await run(page); expect(result.response.statevector[1]!.imag).toBeCloseTo(Math.SQRT1_2, 12);
  await button(page, 'π').click(); await button(page, 'Apply gate changes').click();
  const edited = await saved(page); expect(edited.gates[0]!.id).toBe(original.gates[0]!.id);
  expect(edited.gates[0]!.params).toEqual([Math.PI]);
  await expect(page.getByRole('status').filter({ hasText: 'Results are stale' })).toBeVisible();
  const updated = await run(page); expect(updated.response.statevector[1]!.imag).toBeCloseTo(-1, 12);
  await openCode(page); await expect(sourceEditor(page)).toHaveValue(toOpenQasm(edited));
});

test('multi-qubit visual placement uses distinct operands and CCX has two controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free');
  await expect(button(page, 'Choose CCX gate')).toBeDisabled();
  await button(page, 'Add qubit').click();
  for (const [index, kind, operands] of [[1, 'CZ', [2, 0]], [2, 'SWAP', [0, 2]], [3, 'CCX', [2, 0, 1]]] as const) {
    await button(page, `Choose ${kind} gate`).click();
    await button(page, `Place gate on q${operands[0]} at step ${index}`).click();
    await expect(button(page, 'Run Simulation')).toBeDisabled();
    await button(page, `Place gate on q${operands[0]} at step ${index}`).click();
    await expect(page.getByRole('alert')).toContainText('different target qubit');
    for (const operand of operands.slice(1)) await button(page, `Place gate on q${operand} at step ${index}`).click();
    await expect(button(page, 'Run Simulation')).toBeEnabled();
  }
  const circuit = await saved(page);
  expect(circuit.gates.map(gateMeaning)).toEqual([
    makeGate('cz', [2, 0]), makeGate('swap', [0, 2]), makeGate('ccx', [2, 0, 1]),
  ].map(gateMeaning));
  await openCode(page); await expect(sourceEditor(page)).toHaveValue(toOpenQasm(circuit));
  expect((await run(page)).response.probabilities['000']).toBeCloseTo(1, 12);
});

test('a late real parser response cannot replace a newer applied circuit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free'); await openCode(page);
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let received = false; let delivered = false; let first = true;
  await page.route('**/api/circuits/parse', async route => {
    if (!first) { await route.continue(); return; }
    first = false;
    const real = await route.fetch(); received = true; await hold;
    try { await route.fulfill({ response: real }); } catch { /* The old fetch was cancelled. */ }
    delivered = true;
  });
  try {
    await sourceEditor(page).fill(codeTemplates.bell.source); await button(page, 'Apply code').click();
    await expect.poll(() => received).toBe(true);
    await sourceEditor(page).fill(codeTemplates.rotation.source); await apply(page);
    const current = await saved(page); expect(current.gates[0]!.type).toBe('ry');
    release(); await expect.poll(() => delivered).toBe(true);
    expect(await saved(page)).toEqual(current);
    await expect(sourceEditor(page)).toHaveValue(toOpenQasm(current));
  } finally { release(); }
});

test('visual edits while a code draft is pending require explicit replacement and are undoable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free'); await openCode(page);
  await sourceEditor(page).fill(codeTemplates.rotation.source);
  await button(page, 'Circuit editor').click(); await button(page, 'Place gate on q0 at step 1').click();
  const visual = await saved(page); await openCode(page);
  await expect(sourceEditor(page)).toHaveValue(codeTemplates.rotation.source);
  await expect(page.getByRole('status').filter({ hasText: 'changed while this code draft was pending' })).toBeVisible();
  await apply(page, 'Replace circuit with draft'); await button(page, 'Undo').click();
  expect(await saved(page)).toEqual(visual);
});

test('serializer round trips every gate and 256-operation limits through the real canonical parser', async ({ request }) => {
  const circuits: SimulationRequest[] = gateTypes.map(type => ({ ...blank, numQubits: 3,
    gates: [makeGate(type, [2, 0, 1].slice(0, arity(type)), -.3141592653589793, `id-${type}`)] }));
  circuits.push({ ...blank, gates: Array.from({ length: 256 }, (_, i) => makeGate('ry', [i % 2], i % 2 ? Number.MAX_VALUE : Number.MIN_VALUE, `limit-${i}`)) });
  for (const circuit of circuits) {
    const response = await request.post('/api/circuits/parse', { data: { source: toOpenQasm(circuit), shots: circuit.shots, seedSimulator: circuit.seedSimulator } });
    expect(response.status()).toBe(200);
    const parsed = (await response.json()).circuit as SimulationRequest;
    expect(parsed.gates.map(gateMeaning)).toEqual(circuit.gates.map(gateMeaning));
    expect(validCircuitDraft(parsed)).toBe(true);
    expect(reconcileGateIds(circuit.gates, parsed.gates)).toEqual(circuit.gates);
  }
  const circuit = circuits.find(c => c.gates[0]!.type === 'ccx')!;
  expect(toQiskitPython(circuit)).toContain('qc.ccx(2, 0, 1)');
  const rotation = circuits.find(c => c.gates[0]!.type === 'ry')!;
  expect(toQiskitPython(rotation)).toContain('qc.ry(-0.3141592653589793, 2)');
});

test('draft validation and history include parameters and reject corrupt gate data', () => {
  const old: SimulationRequest = { ...blank, gates: [makeGate('h', [0], 0, 'legacy')] };
  expect(validCircuitDraft(old)).toBe(true);
  const rotated: SimulationRequest = { ...blank, gates: [makeGate('ry', [0], Math.PI / 2, 'rotation')] };
  const changed: SimulationRequest = { ...rotated, gates: [makeGate('ry', [0], Math.PI, 'rotation')] };
  expect(circuitKey(rotated)).not.toBe(circuitKey(changed));
  for (const corrupt of [
    { ...rotated.gates[0], params: [] }, { ...rotated.gates[0], params: [NaN] }, { ...rotated.gates[0], params: ['pi'] },
    { ...rotated.gates[0], params: [true] }, { ...rotated.gates[0], params: [Infinity] }, { ...old.gates[0], params: [] },
    makeGate('ccx', [0, 0, 1]), makeGate('swap', [1, 1]), { ...old.gates[0], type: 'toString' },
  ]) expect(validCircuitDraft({ ...blank, gates: [corrupt] })).toBe(false);
  const initial = { past: [], present: old, future: [], error: null };
  const applied = editorReducer(initial, { type: 'replace', request: rotated });
  expect(applied.past).toEqual([old]);
  const edited = editorReducer(applied, { type: 'update', gate: changed.gates[0]! });
  expect(editorReducer(edited, { type: 'undo' }).present).toEqual(rotated);
  expect(editorReducer(editorReducer(edited, { type: 'undo' }), { type: 'redo' }).present).toEqual(changed);
  const rejected = editorReducer(applied, { type: 'update', gate: { ...rotated.gates[0], params: [Infinity] } as Gate });
  expect(rejected.present).toEqual(rotated); expect(rejected.error).toBeTruthy();
});

test('oversize insertion is rejected without silently truncating code to a runnable prefix', async ({ page }) => {
  await page.goto('/lab?workspace=free'); await openCode(page);
  const before = await sourceEditor(page).inputValue();
  await sourceEditor(page).fill(codeTemplates.h.source + '// ' + 'x'.repeat(32768));
  await expect(page.getByRole('alert')).toContainText('Code was not inserted');
  await expect(sourceEditor(page)).toHaveValue(before);
  expect((await saved(page)).gates).toEqual([]);
});

test('pending code survives client navigation when session storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.removeItem = () => { throw new Error('Storage blocked'); };
  });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/lab?workspace=free'); await openCode(page);
  const text = codeTemplates.rotation.source + '// still editing\n';
  await sourceEditor(page).fill(text);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Circuit Lab', exact: true }).click();
  await openCode(page); await expect(sourceEditor(page)).toHaveValue(text);
  await apply(page);
  await expect(button(page, 'Select RY gate at step 1')).toBeVisible();
});

test('trace identity rejects wrong or missing angle echoes from a real response', async ({ request }) => {
  const circuit: SimulationRequest = { ...blank, gates: [makeGate('ry', [0], Math.PI / 2)] };
  const response = await request.post('/api/simulate/trace', { data: circuit });
  expect(response.status()).toBe(200);
  const body = await response.json(); expect(validTrace(body, circuit)).toBe(true);
  body.steps[1].gate.params = [Math.PI]; expect(validTrace(body, circuit)).toBe(false);
  delete body.steps[1].gate.params; expect(validTrace(body, circuit)).toBe(false);
});
