import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { TutorRequest, TutorResponse } from '../src/tutor/types';

// These tests own this backend. Real Qiskit; a plainly labeled provider double.
let backend: ChildProcess | undefined;
async function startBackend(factory = 'tests.tutor_browser_app:create_test_app') {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject); probe.listen(8001, '127.0.0.1', () => probe.close(() => resolve()));
  });
  backend = spawn(fileURLToPath(new URL('../../backend/.venv/bin/python', import.meta.url)),
    ['-m', 'uvicorn', factory, '--factory', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
      env: { ...process.env, QLP_AI_ENABLED: 'false', OPENAI_API_KEY: '', QLP_CORS_ORIGINS: '[]', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  backend.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  await once(backend, 'spawn');
  await expect.poll(async () => {
    if (backend?.exitCode !== null) throw new Error(log);
    try { return (await fetch('http://127.0.0.1:8001/api/health')).status; } catch { return 0; }
  }).toBe(200);
}
async function stopBackend() {
  const child = backend; backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
}
const panel = (page: Page) => page.getByRole('dialog', { name: 'AI Tutor', exact: true });
async function open(page: Page, path = '/lab?workspace=free') {
  await page.goto(path);
  await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByLabel('Your question', { exact: true })).toBeFocused();
}
async function ask(page: Page, question: string) {
  await page.getByLabel('Your question', { exact: true }).fill(question);
  const pending = page.waitForResponse('**/api/ai/tutor');
  await panel(page).getByRole('button', { name: 'Send', exact: true }).click();
  return await pending;
}
async function close(page: Page) {
  await page.getByRole('button', { name: 'Close AI Tutor' }).click();
}
async function delayNext(page: Page) {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/ai/tutor', async (route) => {
    const response = await route.fetch(); // Actual server/Qiskit work finishes normally.
    await pending;
    await route.fulfill({ response }).catch(() => {});
  }, { times: 1 });
  return release;
}

test.describe('Tutor with real backend grounding and explicit provider double', () => {
  test.beforeAll(() => startBackend());
  test.afterAll(stopBackend);
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });

  for (const [id, title] of [
    ['measurement', 'Qubits and measurement'], ['superposition', 'Superposition & the Hadamard gate'],
    ['phase', 'Phase and interference'], ['entanglement', 'Entanglement and Bell states'],
  ]) {
    test(`opens contextually from ${id} without altering lesson progress`, async ({ page }) => {
      await open(page, `/learn/${id}`);
      await expect(page.getByTestId('tutor-context')).toContainText(title!);
      const before = await page.evaluate(() => JSON.stringify(sessionStorage));
      const response = await ask(page, 'What is a qubit?');
      expect(response.status()).toBe(200);
      const request = response.request().postDataJSON() as TutorRequest;
      expect(request.lessonId).toBe(id); expect(request.circuit).toBeNull();
      await expect(panel(page).getByText('✦ AI explanation')).toBeVisible();
      expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe(before);
      await page.keyboard.press('Escape');
      await expect(panel(page)).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'AI Tutor', exact: true })).toBeFocused();
    });
  }

  test('welcome, real H facts, readable conversation and bounded recent history', async ({ page }, testInfo) => {
    await page.goto('/lab?workspace=free');
    await page.getByLabel('Load template').selectOption('h');
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(panel(page).getByRole('heading', { name: 'Let’s make quantum feel understandable.' })).toBeVisible();
    const response = await ask(page, 'Why does H give 50% and 50%?');
    const body = await response.json() as TutorResponse;
    expect(body.facts!.snapshots[1]!.probabilities['0']).toBeCloseTo(.5, 12);
    await panel(page).getByText('Verified by Qiskit · step 1', { exact: true }).click();
    await expect(panel(page).getByText('50%', { exact: true })).toHaveCount(2);
    await panel(page).getByText('Go a little deeper', { exact: true }).click();
    await expect(panel(page).getByText(/Provider test double: H combines/)).toBeVisible();
    const next = await ask(page, 'Explain it more simply');
    expect((next.request().postDataJSON() as TutorRequest).history.map((m) => m.role)).toEqual(['user', 'assistant']);
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(2);
    await testInfo.attach('tutor-real-h-context-provider-double.json', { body: JSON.stringify(body, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('tutor-desktop.png'), fullPage: true });
  });

  test('circuit and trace step changes update context and exclude older history', async ({ page }) => {
    await page.goto('/lab?workspace=free');
    await page.getByLabel('Load template').selectOption('bell');
    await page.getByRole('button', { name: 'Explore steps', exact: true }).click();
    await expect(page.getByLabel('Trace step', { exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(page.getByTestId('tutor-context')).toContainText('Step 0');
    await ask(page, 'Explain this initial step');
    await close(page);
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(page.getByTestId('tutor-context')).toContainText('Step 1');
    const response = await ask(page, 'What changed at this step?');
    const request = response.request().postDataJSON() as TutorRequest;
    expect(request.selectedStep).toBe(1); expect(request.history).toEqual([]);
    const body = await response.json() as TutorResponse;
    expect(body.facts!.snapshots[1]!.probabilities['01']).toBeCloseTo(.5, 12);
    expect(body.facts!.snapshots[2]!.probabilities['11']).toBeCloseTo(.5, 12);
    await close(page);
    await page.getByLabel('Load template').selectOption('hh');
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(page.getByTestId('tutor-context')).toContainText('1 qubits · 2 gates · Final state');
    await expect(panel(page).getByText(/Earlier context/)).toHaveCount(2);
  });

  test('loading, cancellation and retry never display a late answer', async ({ page }) => {
    await open(page);
    const release = await delayNext(page);
    await page.getByLabel('Your question', { exact: true }).fill('Explain H');
    await panel(page).getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel(page).getByRole('status')).toContainText('Checking context');
    await panel(page).getByRole('button', { name: 'Cancel request' }).click();
    release();
    await expect(panel(page).getByRole('status')).toContainText('Request cancelled');
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Retry question' }).click();
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(1);
    await expect(panel(page).getByText('Explain H', { exact: true })).toHaveCount(1);
  });

  test('provider failure is an error, with working retry and no fake answer', async ({ page }) => {
    await open(page);
    await page.route('**/api/ai/tutor', async (route) => {
      await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), question: 'Test provider unavailable' }) });
    }, { times: 1 });
    const response = await ask(page, 'What is a qubit?');
    expect(response.status()).toBe(503);
    await expect(panel(page).getByRole('alert')).toContainText('not configured');
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Retry question' }).click();
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(1);
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
  });

  test('circuit proposal requires preview and explicit confirmation, and supports Undo', async ({ page }, testInfo) => {
    await open(page);
    const response = await ask(page, 'How can I build a Bell state from an empty circuit?');
    expect((await response.json() as TutorResponse).suggestion!.facts.snapshots[2]!.probabilities['11']).toBeCloseTo(.5, 12);
    await expect(page.getByTestId('tutor-context')).toContainText('0 gates');
    await expect(panel(page).getByRole('button', { name: 'Confirm replacement' })).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Preview circuit' }).click();
    await expect(panel(page).getByText('CX · control q0 → target q1')).toBeVisible();
    await expect(page.getByTestId('tutor-context')).toContainText('0 gates');
    await page.screenshot({ path: testInfo.outputPath('tutor-suggestion-preview.png'), fullPage: true });
    await panel(page).getByRole('button', { name: 'Confirm replacement' }).click();
    await expect(page.getByTestId('tutor-context')).toContainText('2 gates');
    await close(page);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    const pending = page.waitForResponse('**/api/simulate');
    await page.getByRole('button', { name: 'Run Simulation', exact: true }).click();
    expect((await (await pending).json()).probabilities['11']).toBeCloseTo(.5, 12);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(page.getByTestId('tutor-context')).toContainText('0 gates');
  });

  test('older proposals cannot replace an edited circuit', async ({ page }) => {
    await open(page);
    await ask(page, 'Build a Bell state');
    await close(page);
    await page.getByLabel('Load template').selectOption('x');
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Preview circuit' }).click();
    await expect(panel(page).getByRole('button', { name: 'Confirm replacement' })).toBeDisabled();
    await expect(panel(page).getByText(/Context changed. Ask again/)).toBeVisible();
  });

  test('clear during loading discards the response and erases local conversation', async ({ page }) => {
    await open(page);
    const release = await delayNext(page);
    await page.getByLabel('Your question', { exact: true }).fill('Explain H');
    await panel(page).getByRole('button', { name: 'Send', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Clear conversation' }).click();
    release();
    await expect(panel(page).getByRole('heading', { name: 'Let’s make quantum feel understandable.' })).toBeVisible();
    await expect(panel(page).getByRole('log')).toBeEmpty();
    await expect(panel(page).getByRole('button', { name: 'Retry question' })).toHaveCount(0);
    const response = await ask(page, 'What is an amplitude?');
    expect((response.request().postDataJSON() as TutorRequest).history).toEqual([]);
  });

  test('changing context cancels an in-flight answer', async ({ page }) => {
    await open(page);
    const release = await delayNext(page);
    await page.getByLabel('Your question', { exact: true }).fill('Explain my empty circuit');
    await panel(page).getByRole('button', { name: 'Send', exact: true }).click();
    await close(page);
    await page.getByLabel('Load template').selectOption('bell');
    release();
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Retry question' })).toHaveCount(0);
    await expect(page.getByTestId('tutor-context')).toContainText('2 gates');
  });

  test('model text renders safely; corrupt numerical facts and unsupported suggestions are rejected', async ({ page }) => {
    await open(page);
    await page.route('**/api/ai/tutor', async (route) => {
      const response = await route.fetch(); const body = await response.json();
      body.answer = '<img src=x onerror="window.tutorInjected=true"><script>window.tutorInjected=true</script>';
      await route.fulfill({ response, json: body });
    }, { times: 1 });
    await ask(page, 'Show safe text');
    await expect(panel(page).locator('.tutor-answer > .tutor-prose')).toContainText('<script>');
    await expect(panel(page).locator('script, img')).toHaveCount(0);
    expect(await page.evaluate(() => 'tutorInjected' in window)).toBe(false);
    for (const corrupt of ['facts', 'bloch', 'suggestion']) {
      await panel(page).getByRole('button', { name: 'Clear conversation' }).click();
      await page.route('**/api/ai/tutor', async (route) => {
        const response = await route.fetch(); const body = await response.json();
        if (corrupt === 'facts') body.facts.snapshots[0].probabilities['00'] = .123;
        else if (corrupt === 'bloch') body.facts.snapshots[0].qubits[0].blochVector.z = 0;
        else body.suggestion.circuit.gates[0].type = 'python';
        await route.fulfill({ response, json: body });
      }, { times: 1 });
      await ask(page, 'Build a Bell state');
      await expect(panel(page).getByRole('alert')).toContainText('failed validation');
      await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(0);
    }
  });

  test('mobile full-width dialog supports keyboard, focus containment and unchanged Lab width', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/learn/entanglement');
    const bounds = await panel(page).boundingBox(); expect(bounds!.width).toBe(390);
    await page.getByLabel('Your question', { exact: true }).fill('Why are the Bloch vectors centered?');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByText('✦ AI explanation')).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.tutor-panel'))).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('tutor-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'AI Tutor', exact: true })).toBeFocused();
    await page.goto('/lab?workspace=free');
    const before = await page.locator('.lab-workspace').boundingBox();
    await page.getByRole('button', { name: 'AI Tutor', exact: true }).click();
    expect((await page.locator('.lab-workspace').boundingBox())!.width).toBe(before!.width);
    await close(page); await expect(page.getByRole('button', { name: 'Choose H gate' })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

test.describe('Tutor with genuinely unconfigured product backend', () => {
  test.beforeAll(() => startBackend('app.main:create_app'));
  test.afterAll(stopBackend);
  test('no credential produces a real configuration error and no fabricated chat', async ({ page }) => {
    await open(page, '/learn/measurement');
    const response = await ask(page, 'What is a qubit?');
    expect(response.status()).toBe(503);
    expect((await response.json()).error.code).toBe('tutor_not_configured');
    await expect(panel(page).getByRole('alert')).toContainText('not configured');
    await expect(panel(page).getByText('✦ AI explanation')).toHaveCount(0);
    await close(page);
    await expect(page.getByRole('heading', { name: 'Qubits and measurement', exact: true })).toBeVisible();
  });
});
