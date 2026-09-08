/** Live browser walkthrough; every reported result comes from the local Qiskit API. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5181';
const output = process.argv[3] ?? '/private/tmp/qlp-algorithm-review';
const url = new URL(base);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Use a local HTTP preview.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const evidence = [], errors = [], aiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.url().includes('/api/ai/')) aiCalls.push(r.url()); });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(base);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Quantum makes sense');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Algorithms', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.screenshot({ path: `${output}/catalog-desktop.png`, fullPage: true });
  expect(await page.locator('vite-error-overlay').count()).toBe(0);
  console.log('Dev server verified: dashboard and catalog render, navigation works, no framework overlay.');
  for (const mobile of [false, true]) {
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 });
    for (const sample of [
      { id: 'deutsch-jozsa', oracle: 'one', expected: 'Constant function', name: 'constant' },
      { id: 'deutsch-jozsa', oracle: 'q1', expected: 'Balanced function', name: 'balanced' },
      { id: 'grover', iterations: '1', expected: '100.00%', name: 'grover-one' },
      { id: 'grover', iterations: '2', expected: '25.00%', name: 'grover-two' },
    ]) {
      await page.goto(`${base}/algorithms/${sample.id}`);
      if (sample.oracle) await page.getByLabel('Oracle rule', { exact: true }).selectOption(sample.oracle);
      else {
        await page.getByLabel('Grover iterations', { exact: true }).selectOption(sample.iterations);
        await button('Mark item 10').click();
      }
      await expect(page.getByRole('heading', { name: 'Generated circuit', exact: true })).toBeVisible();
      const submitted = page.getByRole('radio', { name: 'I’m not sure yet', exact: true });
      if (await submitted.isEnabled()) { await submitted.check(); await button('Submit prediction').click(); }
      const response = page.waitForResponse(r => r.url().endsWith('/api/algorithms/run'));
      await button('Run algorithm').click();
      const actual = await response; expect(actual.status()).toBe(200);
      const result = await actual.json();
      await expect(page.getByTestId('algorithm-conclusion')).toHaveText(sample.expected);
      const results = page.getByRole('region', { name: 'Algorithm results', exact: true });
      await results.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${sample.name}-${mobile ? 'mobile' : 'desktop'}-result.png` });
      await page.screenshot({ path: `${output}/${sample.name}-${mobile ? 'mobile' : 'desktop'}-full.png`, fullPage: true });
      await button(sample.oracle ? 'Inspect Query the oracle' : 'Inspect 1 · Phase oracle').click();
      await button('Step statevector').click();
      await page.getByRole('region', { name: 'State Explorer', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${sample.name}-${mobile ? 'mobile' : 'desktop'}-trace.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (sample.name === 'grover-one') {
        await page.getByLabel('Grover iterations', { exact: true }).selectOption('2');
        await expect(page.getByRole('region', { name: 'Algorithm results', exact: true })).toHaveCount(0);
        await expect(page.getByText('Selections changed.', { exact: false })).toBeVisible();
      }
      if (sample.name === 'constant') {
        await page.getByLabel('Oracle rule', { exact: true }).selectOption('q0');
        await expect(page.getByRole('region', { name: 'Algorithm results', exact: true })).toHaveCount(0);
      }
      evidence.push({ name: sample.name, viewport: mobile ? 'mobile' : 'desktop', result });
      console.log(`${mobile ? 'Mobile' : 'Desktop'} ${sample.name}: ${sample.expected}, ${result.simulation.shots} real shots.`);
    }
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/algorithms`);
    await expect(page.getByRole('article')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/catalog-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]); expect(aiCalls).toEqual([]);
  await writeFile(`${output}/verified-algorithms.json`, JSON.stringify({ base, verifiedAt: new Date().toISOString(), evidence, errors, aiCalls }, null, 2));
  console.log(JSON.stringify({ base, output, examples: evidence.length, errors, aiCalls }));
} finally { await browser.close(); }
