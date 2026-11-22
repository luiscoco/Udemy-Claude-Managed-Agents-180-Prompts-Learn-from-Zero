import { test, expect } from '@playwright/test';

test('compare three runs, inspect source evidence, explore execution and code, and reset', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Who runs the agent?' })).toBeVisible();
  await expect(page.locator('.hero-art img')).toBeVisible();
  await expect.poll(() => page.locator('.hero-art img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('desktop-light.png'), fullPage: true });
  await page.getByLabel('Playback pace').selectOption('fast');
  await page.getByRole('button', { name: 'Run all three' }).click();
  await expect(page.locator('.run-status.complete')).toHaveCount(3);
  await page.getByRole('button', { name: 'Inspect source 1 for Managed Agents', exact: true }).click();
  await expect(page.locator('#document mark')).toContainText('€1.20 million');
  await page.screenshot({ path: testInfo.outputPath('desktop-results.png'), fullPage: true });
  await page.getByRole('button', { name: 'Execution', exact: true }).click();
  await expect(page.getByTestId('product-managed')).toContainText('Anthropic service');
  await expect(page.getByTestId('product-sdk')).toContainText('SDK in your process');
  await expect(page.getByTestId('product-messages')).toContainText('Make one model request');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByTestId('content-managed')).toContainText('await client.beta.sessions.events.stream');
  await expect(page.getByTestId('content-sdk')).toContainText('maxTurns: 5');
  const snippets = (await (await page.request.get('/api/config')).json()).snippets;
  for (const product of ['managed', 'sdk', 'messages']) {
    const code = page.getByTestId(`content-${product}`).locator('code.language-typescript');
    expect(await code.textContent()).toBe(snippets[product]);
    await expect(code.locator('.token.keyword').first()).toBeVisible();
    await expect(code.locator('.token.string').first()).toBeVisible();
    expect(await code.locator('.token.keyword').first().evaluate(node => getComputedStyle(node).color))
      .not.toBe(await code.locator('.token.string').first().evaluate(node => getComputedStyle(node).color));
  }
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.getByTestId('content-managed').locator('.token.keyword').first()).toHaveCSS('color', 'rgb(196, 161, 255)');
  await page.screenshot({ path: testInfo.outputPath('code-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('code-light.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export lesson results' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('prompt-01-lesson-results.json');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export lesson results' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('edited documents drive the result and clear previous evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit document', exact: true }).click();
  await page.getByLabel('Source document text').fill('Revenue increased 5% during the quarter. The launch was delayed by 40 days due to a supplier shortfall.');
  await page.getByRole('button', { name: 'Save document', exact: true }).click();
  await page.getByLabel('Playback pace').selectOption('fast');
  await page.getByTestId('product-messages').getByRole('button', { name: 'Run analysis' }).click();
  await expect(page.getByTestId('product-messages').locator('.run-status')).toHaveText('Complete');
  await expect(page.getByTestId('content-messages')).toContainText('5%');
  await expect(page.getByTestId('content-messages')).not.toContainText('1.20 million');
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(page.locator('.run-status.complete')).toHaveCount(0);
  await expect(page.locator('#document')).toContainText('Northstar');
});

test('upload, input validation, and stop preserve usable controls', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Upload text document').setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain',
    buffer: Buffer.from('A customer accounts for 50% of revenue. The contract expires in 10 days without a signed renewal.') });
  await expect(page.locator('#document')).toContainText('50%');
  await page.getByRole('button', { name: 'Run all three' }).click();
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(page.getByRole('button', { name: 'Run all three' })).toBeEnabled();
  await expect(page.locator('.run-error')).toContainText('Stopped');
  const invalid = await request.post('/api/run', { data: { product: 'managed', mode: 'demo', report: 'short' } });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.post('/api/run', { headers: { Origin: 'https://unrelated.example' }, data: {} });
  expect(crossOrigin.status()).toBe(403);
});

test('live configuration feedback and mobile layout work without sending a live request', async ({ page }, testInfo) => {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.readiness = Object.fromEntries(['managed', 'sdk', 'messages'].map(id => [id, { ready: false, needs: ['ANTHROPIC_API_KEY'] }]));
    await route.fulfill({ json: config });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live Claude', exact: true }).click();
  await expect(page.locator('.setup-note')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Run 0 configured' })).toBeDisabled();
  await expect(page.locator('#notice')).toContainText('server-side credentials');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Classroom demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run all three' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('mobile-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.loop-owner strong').first()).toHaveCSS('color', 'rgb(237, 245, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('desktop-dark.png'), fullPage: true });
});
