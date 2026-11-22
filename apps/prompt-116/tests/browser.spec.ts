import { test, expect } from '@playwright/test';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lessons } from '../src/lessons.js';
import { buildId } from '../src/build.js';

const selected = process.env.LESSONS ? new Set(process.env.LESSONS.split(',').map(Number)) : null;
for (const lesson of lessons.filter(item => !selected || selected.has(item.number))) {
  test(`Prompt ${lesson.number}: ${lesson.title}`, async ({ page, context }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const recording = info.project.name === 'record';
    await page.goto(recording ? '/?presentation=1' : '/');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/reset') && response.status() === 200), page.locator('#reset').click()]);
    await expect(page.locator('#status')).toContainText('revision 0');
    await expect(page.locator('#title')).toContainText(`Prompt ${lesson.number}`);
    if (recording) await page.waitForTimeout(1800);
    for (let index = 0; index < lesson.walkthrough.length; index++) {
      await page.locator('#next').click();
      await expect(page.locator('#status')).toContainText(`revision ${index + 1}`, { timeout: 30000 });
      await expect(page.locator('#error')).toBeEmpty();
      await expect(page.locator('#result .token')).not.toHaveCount(0);
      if (recording) await page.waitForTimeout(1600);
    }
    await expect(page.locator('#events li')).toHaveCount(lesson.walkthrough.length);
    const api = await context.request.get(`/api/lesson/${lesson.number}`); const payload = await api.json();
    expect(payload.state.revision).toBe(lesson.walkthrough.length);
    for (const item of payload.state.artifacts) {
      const response = await context.request.get(`/api/lesson/${lesson.number}/download?name=${encodeURIComponent(item.name)}`);
      expect(response.status(), item.name).toBe(200); expect((await response.body()).byteLength).toBeGreaterThan(20);
      if (/\.(docx|pptx|xlsx)$/.test(item.name)) expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
      if (item.name.endsWith('.pdf')) expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    const codes = page.locator('#examples code');
    for (let i = 0; i < lesson.examples.length; i++) {
      expect(await codes.nth(i).textContent()).toBe(lesson.examples[i].code);
      await expect(codes.nth(i).locator('.token')).not.toHaveCount(0);
    }
    // Check readable highlighted code in both approved themes.
    const first = codes.first();
    await first.scrollIntoViewIfNeeded();
    const normalColor = await first.locator('.token').first().evaluate(node => getComputedStyle(node).color);
    expect(normalColor).not.toBe('rgb(233, 240, 255)');
    if (recording) await page.waitForTimeout(6500);
    await page.evaluate(() => { document.body.classList.remove('presentation'); document.getElementById('theme')!.click(); });
    await expect(page.locator('body')).toHaveClass(/dark/);
    expect(await first.locator('.token').first().evaluate(node => getComputedStyle(node).color)).not.toBe('rgb(233, 240, 255)');
    if (recording) await page.waitForTimeout(2500);
    await page.evaluate(() => { document.getElementById('theme')!.click(); document.body.classList.add('presentation'); });
    await page.locator('.timeline').scrollIntoViewIfNeeded();
    if (recording) await page.waitForTimeout(2200);
    expect(errors).toEqual([]);
    const folder = resolve('artifacts'); await mkdir(folder, { recursive: true });
    await page.screenshot({ path: resolve(folder, `prompt-${String(lesson.number).padStart(2, '0')}-${recording ? 'demo' : 'verified'}.png`), fullPage: true });
    const receipt = { buildId, prompt: lesson.number, title: lesson.title, passed: true, walkthroughSteps: lesson.walkthrough.length, revision: payload.state.revision, themes: ['light', 'dark'], codePreserved: true, viewport: '1920x1080', providerCallsTested: false, checkedAt: new Date().toISOString() };
    await writeFile(resolve(folder, 'standalone-verification.json'), JSON.stringify(receipt, null, 2));
    if (recording) { const video = page.video()!; await page.close(); const source = await video.path(); await copyFile(source, resolve(folder, `prompt-${String(lesson.number).padStart(2, '0')}-demo.webm`)); await writeFile(resolve(folder, 'standalone-recording.json'), JSON.stringify(receipt, null, 2)); }
  });
}
