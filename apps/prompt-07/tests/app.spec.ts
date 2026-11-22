import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('students create, update and repeat with the same IDs, then inspect missing-lock and rename plans', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#review').click();
  await expect(page.locator('#plan-summary')).toContainText('2 to create');
  await page.locator('#apply').click();
  await expect(page.locator('#history tr')).toHaveCount(1);
  const first = await (await page.request.get('/api/state')).json();
  await page.locator('#revise').click();
  await page.locator('#review').click();
  await expect(page.locator('#plan-summary')).toContainText('1 to update');
  await page.locator('#apply').click();
  await expect(page.locator('#continuity')).toContainText('version 2');
  await expect(page.locator('#continuity')).toContainText(first.history[0].agentId);
  await page.locator('#review').click();
  await expect(page.locator('#plan-summary')).toContainText('2 unchanged');
  await page.locator('#apply').click();
  await expect(page.locator('#history tr')).toHaveCount(3);
  await page.locator('#missing-lock').check();
  await page.locator('#review').click();
  await expect(page.locator('#plan-summary')).toContainText('2 to create');
  await expect(page.locator('#plan-warnings')).toContainText('missing');
  await page.locator('#missing-lock').uncheck();
  await page.locator('#agent-path').selectOption('./agents/reviewer-renamed.md');
  await page.locator('#review').click();
  await expect(page.locator('#plan-summary')).toContainText('1 to create');
  await expect(page.locator('#plan-warnings')).toContainText('Retained mapping');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-lock').click()]);
  const lock = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(lock.resources['./agents/reviewer.md'].id).toBe(first.history[0].agentId);
  await page.reload();
  await expect(page.locator('#system')).toHaveValue(/numbered list/);
  await expect(page.locator('#history tr')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('definition downloads preserve text and Markdown, YAML, JSON and TypeScript stay highlighted in both themes', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const dark of [false, true]) {
    if (dark) await page.locator('#theme-toggle').click();
    await page.locator('#review').click();
    const preview = await (await page.request.post('/api/preview', { data: {
      editor: { agentPath: './agents/reviewer.md', agentName: 'Document reviewer', model: 'claude-opus-5-5',
        system: await page.locator('#system').inputValue(), environmentName: 'reviewer-env', network: 'limited' }, missingLock: false,
    } })).json();
    for (const kind of ['agent', 'environment']) {
      await page.locator(`[data-file="${kind}"]`).click();
      const expected = preview.files.find((file: { path: string }) => file.path.includes(kind === 'agent' ? '/agents/' : '/environments/'));
      expect(await page.locator('#source').textContent()).toBe(expected.text);
      expect(await page.locator('#source .token').count()).toBeGreaterThan(3);
      const colors = await page.locator('#source').evaluate(element => ({ base: getComputedStyle(element).color,
        key: getComputedStyle(element.querySelector('.token.key')!).color }));
      expect(colors.key).not.toBe(colors.base);
    }
    await page.locator('[data-file="src/reconciler.ts"]').click();
    await expect(page.locator('#filename')).toHaveText('src/reconciler.ts');
    expect(await page.locator('#source').textContent()).toBe(await readFile(new URL('../src/reconciler.ts', import.meta.url), 'utf8'));
    await expect(page.locator('#source .token.keyword').first()).toBeAttached();
    await expect(page.locator('#lock-json .token.property').first()).toBeAttached();
    await expect(page.locator('#diff .token.property').first()).toBeAttached();
    await expect(page.locator('#commands .token.function').first()).toBeAttached();
    await page.locator('[data-file="agent"]').click();
    await page.screenshot({ path: testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage: true });
  }
  const expectedText = await page.locator('#source').textContent();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-definition').click()]);
  expect(await readFile((await download.path())!, 'utf8')).toBe(expectedText);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});

test('HTTP rejects stale plans, malformed inputs and arbitrary file access', async ({ request }) => {
  const editor = (await (await request.get('/api/config')).json()).editor;
  const preview = await (await request.post('/api/preview', { data: { editor, missingLock: false } })).json();
  expect((await request.post('/api/apply', { data: { editor: { ...editor, system: 'changed after preview' }, missingLock: false, token: preview.plan.token } })).status()).toBe(409);
  expect((await request.post('/api/preview', { headers: { 'Content-Type': 'application/json' }, data: '{' })).status()).toBe(400);
  expect((await request.get('/api/source?name=.env')).status()).toBe(404);
  expect((await request.post('/api/preview', { headers: { Origin: 'https://example.com' }, data: {} })).status()).toBe(403);
});
