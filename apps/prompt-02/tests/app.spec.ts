import { test, expect } from '@playwright/test';

test('reusable resources connect to separate sessions, with stored messages and highlighted evidence', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See how the pieces fit together.' })).toBeVisible();
  await expect(page.locator('#create')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('desktop-light.png'), fullPage: true });
  await page.getByLabel('Playback pace').selectOption('fast');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.locator('#session-status')).toHaveText('idle');
  const first = await page.locator('#session-reference').textContent();
  await page.getByRole('button', { name: 'Send task' }).click();
  await expect(page.locator('#session-status')).toHaveText('idle · end_turn');
  await expect(page.locator('.agent-message')).toContainText('keeps its own conversation history');
  await expect(page.locator('.event-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.locator('#session-count')).toHaveText('2');
  const second = await page.locator('#session-reference').textContent();
  expect(second).not.toBe(first);
  await expect(page.locator('.agent-message')).toHaveCount(0);
  await expect(page.locator('#agent-reference')).toHaveText('demo_agent_tutor');
  await page.locator('[data-session]').filter({ hasText: first! }).click();
  await expect(page.locator('.agent-message')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#session-count')).toHaveText('2');
  await page.locator('[data-session]').filter({ hasText: first! }).click();
  await page.locator('[data-code="stream"]').click();
  await expect(page.locator('#typescript .token.keyword').first()).toBeVisible();
  await page.locator('.event-row').filter({ hasText: 'agent.message' }).click();
  await expect(page.locator('#json')).toContainText('agent.message');
  await expect(page.locator('#json .token.property').first()).toBeVisible();
  const snippets = (await (await page.request.get('/api/config')).json()).snippets;
  expect(await page.locator('#typescript').textContent()).toBe(snippets.stream);
  await page.screenshot({ path: testInfo.outputPath('desktop-evidence.png'), fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session' }).click();
  expect((await download).suggestedFilename()).toBe('prompt-02-session.json');
  expect(errors).toEqual([]);
});

test('failure exercise and stop preserve a usable session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#create')).toBeEnabled();
  await page.locator('#environment').selectOption('demo_env_missing');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.locator('#notice')).toContainText('Environment reference was not found');
  await page.locator('#environment').selectOption('demo_env_cloud');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.locator('#send')).toBeEnabled();
  await page.getByRole('button', { name: 'Send task' }).click();
  await page.getByRole('button', { name: 'Stop turn' }).click();
  await expect(page.locator('#session-status')).toHaveText('idle · interrupted');
  await expect(page.locator('#send')).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh stored history' }).click();
  await expect(page.locator('#notice')).toContainText('Local stored history refreshed');
});

test('mobile theme persistence and live setup feedback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#create')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#typescript .token.keyword').first()).toHaveCSS('color', 'rgb(196, 161, 255)');
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Live Managed Agents' }).click();
  await expect(page.locator('#notice')).toContainText('ANTHROPIC_API_KEY');
  await expect(page.locator('#create')).toBeDisabled();
  await page.getByRole('button', { name: 'Classroom demo', exact: true }).click();
  await expect(page.locator('#create')).toBeEnabled();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('desktop-dark.png'), fullPage: true });
});

test('invalid and cross-origin requests are rejected', async ({ request }) => {
  const invalid = await request.post('/api/sessions', { data: { mode: 'unknown' } });
  expect(invalid.status()).toBe(400);
  const forbidden = await request.post('/api/sessions', { headers: { Origin: 'https://unrelated.example' }, data: {} });
  expect(forbidden.status()).toBe(403);
  expect((await request.get('/api/sessions/not-registered')).status()).toBe(404);
});
