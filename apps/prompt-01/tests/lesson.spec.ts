import { test, expect } from '@playwright/test';

test('Prompt 1 classroom walkthrough', async ({ page }, testInfo) => {
  await page.goto('/?presentation=1');
  await expect(page.getByRole('heading', { name: 'Who runs the agent?' })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Run all three' }).click();
  await expect(page.locator('.run-status.complete')).toHaveCount(3, { timeout: 15000 });
  await page.locator('.lab').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Inspect source 1 for Managed Agents', exact: true }).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Execution', exact: true }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('execution.png'), fullPage: true });
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('code.language-typescript')).toHaveCount(3);
  for (const product of ['managed', 'sdk', 'messages']) {
    await expect(page.getByTestId(`content-${product}`).locator('.token.keyword').first()).toBeVisible();
  }
  await page.getByTestId('content-managed').scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: testInfo.outputPath('code.png'), fullPage: true });
  await page.getByRole('heading', { name: 'Same task. Different ownership.' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
});
