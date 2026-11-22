import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('students diagnose missing configuration, repair it and inject an SDK fault', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  for (const [scenario, field] of [['agent','AGENT_ID'], ['environment','ENVIRONMENT_ID'], ['key','ANTHROPIC_API_KEY'], ['sdk','SDK']]) {
    await page.locator('#scenario').selectOption(scenario);
    await page.locator('#validate').click();
    await expect(page.locator('#result-status')).toHaveText('Setup blocked');
    await expect(page.locator('#issues')).toContainText(field);
    await expect(page.locator('#request-count')).toHaveText('0');
  }
  await page.locator('#scenario').selectOption('valid');
  await page.locator('#validate').click();
  await expect(page.locator('#result-status')).toHaveText('Ready locally');
  await expect(page.locator('#report')).toContainText('/v1/sessions');
  await page.locator('#server-check').click();
  await expect(page.locator('#server-result')).toContainText('ANTHROPIC_API_KEY');
  expect(errors).toEqual([]);
});

test('actual files preserve source text and coloured syntax in both themes', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const dark of [false, true]) {
    if (dark) await page.locator('#theme-toggle').click();
    for (const name of ['src/config.ts','src/client.ts','src/main.ts','package.json','tsconfig.json']) {
      await page.locator(`[data-file="${name}"]`).click();
      await expect(page.locator('#filename')).toHaveText(name);
      const original = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
      expect(await page.locator('#source').textContent()).toBe(original);
      expect(await page.locator('#source .token').count()).toBeGreaterThan(10);
      const color = await page.locator('#source .token').first().evaluate(e => getComputedStyle(e).color);
      expect(color).not.toBe(await page.locator('#source').evaluate(e => getComputedStyle(e).color));
    }
    await page.locator('[data-file="src/config.ts"]').click();
    await page.locator('#validate').click();
    await expect(page.locator('#report .token.property').first()).toBeAttached();
    await expect(page.locator('#commands .token.function').first()).toBeAttached();
    await page.screenshot({ path:testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage:true });
  }
  await page.setViewportSize({ width:390, height:844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:testInfo.outputPath('mobile-dark.png'), fullPage:true });
});

test('API rejects invalid input and exposes only whitelisted source and safe configuration', async ({ request }) => {
  expect((await request.get('/api/source?name=../.env')).status()).toBe(404);
  expect((await request.post('/api/validate', { data:{ keyPresent:'yes' } })).status()).toBe(400);
  expect((await request.post('/api/validate', { headers:{ Origin:'https://example.com' }, data:{} })).status()).toBe(403);
  const response = await request.post('/api/server-check', { data:{} });
  const report = await response.json();
  expect(report).not.toHaveProperty('requestPlan');
  expect(report.providerRequests).toBe(0);
});
