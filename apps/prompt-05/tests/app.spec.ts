import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { emptyState } from '../src/storage.js';

test('students create resources, observe a response, download IDs and resume after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#create-agent')).toBeEnabled();
  await page.locator('#model').selectOption('unsupported-model');
  await page.locator('#create-agent').click();
  await expect(page.locator('#notice')).toContainText('HTTP 400');
  await expect(page.locator('#create-agent')).toBeEnabled();
  await page.locator('#model').selectOption('classroom-model');
  await page.locator('#create-agent').click();
  await expect(page.locator('#agent-progress')).toHaveText('ID saved');
  const first = await (await page.request.get('/api/state')).json();
  await page.reload();
  await expect(page.locator('#create-agent')).toBeDisabled();
  await expect(page.locator('#create-environment')).toBeEnabled();
  await page.locator('#create-environment').click();
  await expect(page.locator('#start-session')).toBeEnabled();
  await page.locator('#start-session').click();
  await expect(page.locator('#state-value')).toHaveText('accepted');
  await expect(page.locator('.agent-message')).toHaveCount(0);
  await page.locator('#observe').click();
  await expect(page.locator('#state-value')).toHaveText('running');
  await page.locator('#observe').click();
  await expect(page.locator('.agent-message')).toContainText('2 + 2 = 4');
  await expect(page.locator('#stop-reason')).toHaveText('end_turn');
  await page.locator('[data-event]').filter({ hasText: 'agent.message' }).click();
  await expect(page.locator('#event-json')).toContainText('2 + 2 = 4');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const path = await download.path();
  const ids = JSON.parse(await readFile(path!, 'utf8'));
  expect(ids.agentId).toBe(first.agentId);
  expect(ids.environmentId).toMatch(/^demo_env_/);
  expect(ids.sessionId).toMatch(/^demo_session_/);
  expect(Object.keys(ids)).toEqual(['mode', 'agentId', 'environmentId', 'sessionId']);
  await page.reload();
  await expect(page.locator('.agent-message')).toContainText('2 + 2 = 4');
  expect(errors).toEqual([]);
});

test('source and saved evidence preserve coloured syntax in both themes and fit mobile', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const dark of [false, true]) {
    if (dark) await page.locator('#theme-toggle').click();
    for (const file of ['src/resources.ts', 'src/storage.ts', 'src/client.ts', 'src/main.ts']) {
      await page.locator(`[data-file="${file}"]`).click();
      await expect(page.locator('#filename')).toHaveText(file);
      expect(await page.locator('#source').textContent()).toBe(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
      const colors = await page.locator('#source').evaluate(element => ({ base: getComputedStyle(element).color,
        keyword: getComputedStyle(element.querySelector('.token.keyword')!).color }));
      expect(colors.keyword).not.toBe(colors.base);
    }
    await expect(page.locator('#ids .token.property').first()).toBeAttached();
    await expect(page.locator('#event-json .token.property').first()).toBeAttached();
    await expect(page.locator('#commands .token.function').first()).toBeAttached();
    await page.locator('[data-file="src/resources.ts"]').click();
    await page.screenshot({ path: testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});

test('HTTP routes validate input and keep credentials and local files private', async ({ request }) => {
  expect((await request.get('/api/source?name=.env')).status()).toBe(404);
  expect((await request.post('/api/agent', { data: { name: '' } })).status()).toBe(400);
  expect((await request.post('/api/session', { data: { task: 'unsupported classroom task' } })).status()).toBe(400);
  expect((await request.post('/api/agent', { headers: { Origin: 'https://example.com' }, data: {} })).status()).toBe(403);
  const response = await request.get('/api/state');
  expect(await response.text()).not.toContain('synthetic-classroom-placeholder');
});

test('a creation persistence error keeps its recoverable resource ID visible', async ({ page }) => {
  let pending = false;
  await page.route('**/api/state', route => route.fulfill({ json: {
    ...emptyState('demo'), pending: pending ? 'agent' : null,
  } }));
  await page.route('**/api/agent', route => {
    pending = true;
    return route.fulfill({ status: 500, json: {
      error: 'Created agent demo_agent_recoverable. Save that ID in the resource file before retrying.',
    } });
  });
  await page.goto('/');
  await expect(page.locator('#create-agent')).toBeEnabled();
  await page.locator('#create-agent').click();
  await expect(page.locator('#notice')).toContainText('demo_agent_recoverable');
  await expect(page.locator('#create-agent')).toBeDisabled();
});
