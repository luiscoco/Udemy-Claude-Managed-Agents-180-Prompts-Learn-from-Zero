import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('students capture a baseline, diagnose drift, repair it and reuse the tested resource', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#console-test').click();
  await expect(page.locator('#console-result .outcome')).toHaveText('Turn finished');
  await expect(page.locator('#match-count')).toHaveText('5 / 5 fields match');
  await page.locator('#api-test').click();
  await expect(page.locator('#api-result .outcome')).toHaveText('Turn finished');
  expect(await page.locator('#api-result .answer').textContent()).not.toBe(await page.locator('#console-result .answer').textContent());
  await page.locator('#scenario').selectOption('tools');
  await expect(page.locator('#match-count')).toHaveText('4 / 5 fields match');
  await page.locator('#api-test').click();
  await expect(page.locator('#api-result .outcome')).toHaveText('Needs confirmation');
  await expect(page.locator('#api-result')).toContainText('requires_action');
  for (const scenario of ['instructions', 'model', 'environment', 'input']) {
    await page.locator('#scenario').selectOption(scenario);
    await expect(page.locator('#match-count')).toHaveText('4 / 5 fields match');
  }
  await page.locator('#scenario').selectOption('same');
  await page.locator('#strategy').selectOption('reuse');
  await expect(page.locator('#source')).not.toContainText('agents.create');
  await page.locator('#api-test').click();
  await expect(page.locator('#api-result .outcome')).toHaveText('Turn finished');
  const original = (await page.locator('#console-result .result-reference').textContent())!.split('Session')[0];
  expect(await page.locator('#api-result .result-reference').textContent()).toContain(original);
  await page.locator('#console-system').fill('Updated baseline');
  await expect(page.locator('#api-test')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('download retains the captured baseline after the API settings change', async ({ page }) => {
  await page.goto('/');
  await page.locator('#console-test').click();
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#scenario').selectOption('instructions');
  await expect(page.locator('#match-count')).toHaveText('4 / 5 fields match');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const profile = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(profile.agent.system).toBe('Summarize findings and cite evidence.');
  expect(profile.consoleAgentId).toMatch(/^demo_console_agent_/);
  expect(profile.agent.tools).toEqual([]);
});

test('dynamic TypeScript and JSON remain highlighted and source files preserve text in both themes', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#console-test').click();
  await expect(page.locator('#match-count')).toHaveText('5 / 5 fields match');
  for (const dark of [false, true]) {
    if (dark) await page.locator('#theme-toggle').click();
    await page.locator('#scenario').selectOption('tools');
    await expect(page.locator('#source')).toContainText('always_ask');
    await expect(page.locator('#source .token.keyword').first()).toBeAttached();
    await expect(page.locator('#comparison-json .token.property').first()).toBeAttached();
    await page.locator('#api-test').click();
    await expect(page.locator('#api-result-events .token.property').first()).toBeAttached();
    for (const name of ['src/reproduce.ts', 'src/main.ts']) {
      await page.locator(`[data-file="${name}"]`).click();
      await expect(page.locator('#filename')).toHaveText(name);
      expect(await page.locator('#source').textContent()).toBe(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));
      const colors = await page.locator('#source').evaluate(element => ({
        base: getComputedStyle(element).color, keyword: getComputedStyle(element.querySelector('.token.keyword')!).color,
      }));
      expect(colors.keyword).not.toBe(colors.base);
    }
    await page.locator('[data-file="generated"]').click();
    await expect(page.locator('#commands .token.function').first()).toBeAttached();
    await page.screenshot({ path: testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});

test('HTTP inputs and source-file access stay within the lesson', async ({ request }) => {
  expect((await request.get('/api/source?name=.env')).status()).toBe(404);
  expect((await request.post('/api/console-test', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/preview', { headers: { Origin: 'https://example.com' }, data: {} })).status()).toBe(403);
});
