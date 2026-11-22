import { test, expect } from '@playwright/test';

test('students inspect SDK headers, raw header failures, legacy authentication and body differences', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4080')) external.push(request.url()); });
  await page.goto('/');
  await page.locator('#send').click();
  await expect(page.locator('#match-count')).toHaveText('6 / 6 core fields match');
  await expect(page.locator('#creation-count')).toHaveText('2 fixture sessions');
  await expect(page.locator('#sdk-captured')).toContainText('Bearer [REDACTED]');
  await expect(page.locator('#sdk-captured')).toContainText('2026-10-21');
  for (const [scenario, status] of [['missing-beta', '400'], ['unsupported-beta', '400'],
    ['missing-version', '400'], ['unsupported-version', '400'], ['missing-auth', '401']]) {
    await page.locator('#scenario').selectOption(scenario);
    await page.locator('#send').click();
    await expect(page.locator('#http-status')).toContainText(status);
    await expect(page.locator('#sdk-status')).toContainText('200');
    await expect(page.locator('#match-count')).toHaveText('5 / 6 core fields match');
  }
  await page.locator('#scenario').selectOption('equivalent');
  await page.locator('#raw-auth').selectOption('x-api-key');
  await page.locator('#send').click();
  await expect(page.locator('#match-count')).toHaveText('6 / 6 core fields match');
  await page.locator('#scenario').selectOption('different-body');
  await page.locator('#send').click();
  await expect(page.locator('#http-status')).toContainText('200');
  await expect(page.locator('#match-count')).toHaveText('5 / 6 core fields match');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('dynamic TypeScript, HTTP/JSON and response JSON remain coloured and exact in both themes', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const dark of [false, true]) {
    if (dark) await page.locator('#theme-toggle').click();
    await page.locator('#sdk-mode').selectOption('explicit');
    await page.locator('#scenario').selectOption('missing-beta');
    await expect(page.locator('#http-code')).not.toContainText('anthropic-beta:');
    await page.locator('#scenario').selectOption('equivalent');
    await page.locator('#send').click();
    await expect(page.locator('#match-count')).toHaveText('6 / 6 core fields match');
    const snippets = await (await page.request.post('/api/preview', { data: {
      sdkMode: 'explicit', rawBeta: 'valid', rawVersion: 'current', rawAuth: 'bearer', differentBody: false,
    } })).json();
    expect(await page.locator('#sdk-code').textContent()).toBe(snippets.sdk);
    expect(await page.locator('#http-code').textContent()).toBe(snippets.http);
    await expect(page.locator('#sdk-code .token.keyword').first()).toBeAttached();
    expect(await page.locator('#http-code .token').count()).toBeGreaterThan(10);
    await expect(page.locator('#http-code .token.property').first()).toBeAttached();
    for (const selector of ['#sdk-response', '#http-response', '#sdk-captured', '#http-captured', '#comparison-json']) {
      await expect(page.locator(`${selector} .token.property`).first()).toBeAttached();
    }
    await expect(page.locator('#commands .token.function').first()).toBeAttached();
    const colors = await page.locator('#sdk-code').evaluate(element => ({
      base: getComputedStyle(element).color, keyword: getComputedStyle(element.querySelector('.token.keyword')!).color,
    }));
    expect(colors.keyword).not.toBe(colors.base);
    await page.screenshot({ path: testInfo.outputPath(dark ? 'desktop-dark.png' : 'desktop-light.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});

test('server keeps request credentials and private files out of lesson responses', async ({ request }) => {
  expect((await request.get('/api/source?name=.env')).status()).toBe(404);
  expect((await request.post('/api/run', { data: { sdkMode: 'invalid' } })).status()).toBe(400);
  expect((await request.post('/api/run', { headers: { Origin: 'https://example.com' }, data: {} })).status()).toBe(403);
  const settings = (await (await request.get('/api/config')).json()).defaults;
  const result = await request.post('/api/run', { data: settings });
  const text = await result.text();
  expect(text).toContain('[REDACTED]');
  expect(text).not.toContain('classroom-only-synthetic-key');
});
