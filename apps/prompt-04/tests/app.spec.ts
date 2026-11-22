import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('students verify both authentication paths and diagnose distinct failures', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4040')) external.push(request.url()); });
  await page.goto('/');
  for (const mode of ['api-key','cli-login']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await page.locator('#credential').selectOption('missing');
    await page.locator('#run').click();
    await expect(page.locator('#result-status')).toHaveText('Stopped locally');
    await expect(page.locator('#fixture-count')).toHaveText('0');
    await page.locator('#credential').selectOption('invalid');
    await page.locator('#run').click();
    await expect(page.locator('#result-status')).toContainText('401');
    await page.locator('#credential').selectOption('valid');
    for (const [resource, status] of [['forbidden','403'],['not-found','404'],['allowed','200']]) {
      await page.locator('#resource').selectOption(resource);
      await page.locator('#run').click();
      await expect(page.locator('#result-status')).toContainText(status);
      await expect(page.locator('#evidence')).toContainText('[REDACTED]');
    }
  }
  await page.locator('#server-status').click();
  await expect(page.locator('#server-result')).toContainText('access unverified');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('source and dynamic JSON retain coloured syntax in both themes without mobile overflow', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const dark of [false,true]) {
    if (dark) await page.locator('#theme-toggle').click();
    await page.locator('#run').click();
    await expect(page.locator('#evidence')).toContainText('[REDACTED]');
    await expect(page.locator('#evidence .token.property').first()).toBeAttached();
    for (const file of ['src/api-client.ts','src/cli-client.ts','src/verify.ts','src/main.ts']) {
      await page.locator(`[data-file="${file}"]`).click();
      await expect(page.locator('#filename')).toHaveText(file);
      expect(await page.locator('#source').textContent()).toBe(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
      expect(await page.locator('#source .token').count()).toBeGreaterThan(10);
      const colors = await page.locator('#source').evaluate(e => ({
        base:getComputedStyle(e).color, token:getComputedStyle(e.querySelector('.token.keyword')!).color,
      }));
      expect(colors.token).not.toBe(colors.base);
    }
    await expect(page.locator('#api-commands .token.function').first()).toBeAttached();
    await expect(page.locator('#cli-commands .token.comment').first()).toBeAttached();
    await page.locator('[data-file="src/api-client.ts"]').click();
    await page.screenshot({ path:testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage:true });
  }
  await page.setViewportSize({ width:390,height:844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:testInfo.outputPath('mobile-dark.png'), fullPage:true });
});

test('HTTP boundaries prevent secret and arbitrary-file disclosure', async ({ request }) => {
  expect((await request.get('/api/source?name=.env')).status()).toBe(404);
  expect((await request.get('/api/source?name=src/classroom.ts')).status()).toBe(404);
  expect((await request.post('/api/run', { data:{ mode:'unsupported' } })).status()).toBe(400);
  expect((await request.post('/api/run', { headers:{ Origin:'https://example.com' }, data:{} })).status()).toBe(403);
  const status = await request.post('/api/server-status', { data:{} });
  const body = await status.text();
  expect(body).not.toContain('server-only-fixture');
  expect(JSON.parse(body)).toMatchObject({ apiKeyConfigured:true, agentIdConfigured:true, verified:false, providerRequests:0 });
  for (const mode of ['api-key','cli-login']) {
    const response = await request.post('/api/run', { data:{ mode,credential:'valid',resource:'allowed' } });
    const text = await response.text();
    expect(text).not.toContain('classroom-accepted-placeholder');
    expect(text).not.toContain('server-only-fixture');
    expect(text).toContain('[REDACTED]');
  }
});
