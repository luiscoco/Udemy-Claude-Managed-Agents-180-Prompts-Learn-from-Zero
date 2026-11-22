import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const apps = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(apps, 'package.json'));
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const catalog = JSON.parse(await readFile(new URL('../../../output/prompt-catalog.json', import.meta.url), 'utf8'));
const applications = JSON.parse(await readFile(new URL('../data/standalone-apps.json', import.meta.url), 'utf8'));
const selected = process.env.LESSONS ? new Set(process.env.LESSONS.split(',').map(Number)) : null;
const lessons = catalog.filter(lesson => lesson.number >= 9 && (!selected || selected.has(lesson.number)));
const folders = lessons.map(lesson => join(apps, `prompt-${String(lesson.number).padStart(2, '0')}`));
const files = folders.flatMap(folder => {
  const configuration = ts.readConfigFile(join(folder, 'tsconfig.json'), ts.sys.readFile);
  return ts.parseJsonConfigFileContent(configuration.config, ts.sys, folder).fileNames;
});
const options = {
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
  noEmit: true, esModuleInterop: true, skipLibCheck: true, types: ['node']
};
const program = ts.createProgram(files, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => apps, getNewLine: () => '\n'
  }));
  process.exit(1);
}
console.log(`TypeScript passed for ${lessons.length} standalone applications.`);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/standalone-typecheck.json', import.meta.url), JSON.stringify({
  passed: true, prompts: lessons.map(lesson => lesson.number), sourceFilesChecked: files.length,
  checkedAt: new Date().toISOString()
}, null, 2));
if (process.env.TYPES_ONLY === '1') process.exit(0);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this verifier with npm run verify:standalone from apps.');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const pending = [...lessons];
const report = { checkedAt: new Date().toISOString(), expected: lessons.length, typescriptPassed: true, completed: [], failed: [] };
let saveQueue = Promise.resolve();
async function save() {
  const text = JSON.stringify(report, null, 2);
  saveQueue = saveQueue.then(() => writeFile(new URL('../artifacts/standalone-progress.json', import.meta.url), text));
  await saveQueue;
}
async function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  } else child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('Application exited before becoming ready');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Application did not start within 30 seconds');
}
async function verify(lesson) {
  const id = String(lesson.number).padStart(2, '0');
  const folder = join(apps, `prompt-${id}`);
  const port = applications.find(application => application.number === lesson.number).port;
  let log = '';
  const child = spawn(process.execPath, [npmCli, 'start'], {
    cwd: folder, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => log = (log + chunk).slice(-15000));
  child.stderr.on('data', chunk => log = (log + chunk).slice(-15000));
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    await ready(`http://127.0.0.1:${port}/api/catalog`, child);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`http://127.0.0.1:${port}/?presentation=1`);
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, `/lesson/${lesson.number}`);
    assert.equal(new URL(page.url()).search, '?presentation=1');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    assert.equal(await page.locator('.navigator').count(), 0);
    const metadata = await (await context.request.get(`http://127.0.0.1:${port}/api/lesson/${lesson.number}`)).json();
    assert.equal(metadata.lesson.number, lesson.number);
    const available = await (await context.request.get(`http://127.0.0.1:${port}/api/catalog`)).json();
    assert.equal(available.length, 1);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/reset') && response.ok()), page.locator('#reset').click()]);
    for (let index = 0; index < metadata.lesson.walkthrough.length; index++) {
      await page.locator('#next').click();
      await page.waitForFunction(revision => document.getElementById('status').textContent.includes(`revision ${revision}`), index + 1);
      assert.equal(await page.locator('#error').innerText(), '');
      assert.ok(await page.locator('#result .token').count());
    }
    const final = await (await context.request.get(`http://127.0.0.1:${port}/api/lesson/${lesson.number}`)).json();
    assert.equal(final.state.revision, metadata.lesson.walkthrough.length);
    assert.equal(final.state.events.length, final.state.revision);
    assert.equal(typeof final.state.result.accepted, 'boolean');
    if (lesson.number === 9) {
      assert.equal(final.state.resources.agent.model, 'classroom-model-a');
      assert.equal(final.state.resources.agent.description, 'Analyzes supplied inventory sources');
      assert.equal(final.state.resources.session.agent, final.state.resources.agent.id);
    }
    if (lesson.number === 25) assert.equal(final.state.result.total, 440);
    if (lesson.number === 62) assert.equal(final.state.resources.writeCount, 1);
    if (lesson.number === 111) assert.match(final.state.result.content, /Competing update/);
    if (lesson.number === 150) assert.equal(final.state.result.accepted, false);
    if (lesson.number === 156) assert.equal(final.state.metrics.tokens, 150);
    if (lesson.number === 166) assert.equal(final.state.result.isolated, true);
    if (lesson.number === 180) {
      assert.equal(final.state.resources.outbox.length, 1);
      assert.equal(final.state.result.duplicate, true);
    }
    for (const artifact of final.state.artifacts) {
      const response = await context.request.get(`http://127.0.0.1:${port}/api/lesson/${lesson.number}/download?name=${encodeURIComponent(artifact.name)}`);
      assert.equal(response.status(), 200, artifact.name);
      const bytes = await response.body();
      assert.ok(bytes.length > 20);
      if (/\.(docx|pptx|xlsx)$/.test(artifact.name)) assert.equal(bytes.subarray(0, 2).toString(), 'PK');
      if (artifact.name.endsWith('.pdf')) assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    }
    const examples = page.locator('#examples code');
    for (let index = 0; index < metadata.lesson.examples.length; index++) {
      assert.equal(await examples.nth(index).textContent(), metadata.lesson.examples[index].code);
      assert.ok(await examples.nth(index).locator('.token').count());
    }
    await page.evaluate(() => document.getElementById('theme').click());
    assert.ok(await page.locator('body').evaluate(body => body.classList.contains('dark')));
    assert.ok(await examples.first().locator('.token').count());
    await page.evaluate(() => document.getElementById('theme').click());
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(folder, 'artifacts/standalone-verified.png'), fullPage: true });
    const receipt = {
      prompt: lesson.number, passed: true, checkedAt: new Date().toISOString(),
      port, entryPoint: 'npm start', applicationSource: `apps/prompt-${id}/src`,
      independentServer: true, singleLessonCatalog: true, walkthroughSteps: final.state.revision,
      themes: ['light', 'dark'], codePreserved: true, downloadsVerified: final.state.artifacts.length,
      providerCallsTested: false
    };
    await writeFile(join(folder, 'artifacts/standalone-verification.json'), JSON.stringify(receipt, null, 2));
    report.completed.push(receipt);
    console.log(`Lesson ${lesson.number}: standalone application verified (${report.completed.length}/${report.expected})`);
  } catch (error) {
    report.failed.push({ prompt: lesson.number, error: error.stack || error.message, log });
    console.error(`Lesson ${lesson.number}: ${error.message}`);
  } finally {
    await context.close();
    await stop(child);
    await save();
  }
}
try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (pending.length) await verify(pending.shift());
  }));
} finally { await browser.close(); }
report.completed.sort((left, right) => left.prompt - right.prompt);
report.passed = report.failed.length === 0 && report.completed.length === report.expected;
report.finishedAt = new Date().toISOString();
await save();
console.log(JSON.stringify({ expected: report.expected, verified: report.completed.length, failures: report.failed.length, passed: report.passed }));
if (!report.passed) process.exitCode = 1;
