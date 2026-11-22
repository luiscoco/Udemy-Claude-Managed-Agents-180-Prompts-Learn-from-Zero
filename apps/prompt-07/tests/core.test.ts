import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, definitionFiles, parseDefinitions } from '../src/definitions.js';
import { ClassroomStore, type State } from '../src/storage.js';
import { Reconciler } from '../src/reconciler.js';

async function fixture() {
  const directory = new URL('../.runtime/core-tests/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const folder = await mkdtemp(join(fileURLToPath(directory), 'run-'));
  const store = new ClassroomStore(join(folder, 'state.json'));
  await store.load();
  return { store, lesson: new Reconciler(store) };
}

test('create, update and repeat retain IDs, advance the agent version once, and survive reload', async () => {
  const { store, lesson } = await fixture();
  const files = definitionFiles(defaults);
  const firstPlan = lesson.plan(files, false);
  assert.equal(firstPlan.summary.created, 2);
  assert.equal(store.snapshot().lock, null);
  const first = await lesson.apply(files, false, firstPlan.token);
  const changed = definitionFiles({ ...defaults, system: defaults.system + '\nReturn numbered findings.' });
  const updatePlan = lesson.plan(changed, false);
  assert.deepEqual(updatePlan.summary, { created: 0, updated: 1, unchanged: 1 });
  const updated = await lesson.apply(changed, false, updatePlan.token);
  assert.equal(updated.history[1].agentId, first.history[0].agentId);
  assert.equal(updated.history[1].agentVersion, 2);
  const samePlan = lesson.plan(changed, false);
  assert.deepEqual(samePlan.summary, { created: 0, updated: 0, unchanged: 2 });
  const repeated = await lesson.apply(changed, false, samePlan.token);
  assert.equal(repeated.remote.length, 2);
  assert.deepEqual(repeated.lock, updated.lock);
  const restored = new ClassroomStore(store.file);
  await restored.load();
  assert.deepEqual(restored.snapshot(), repeated);
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).history.length, 3);
});

test('YAML key order and formatting preserve semantic identity while a display-name edit updates in place', async () => {
  const { lesson } = await fixture();
  const files = definitionFiles(defaults);
  const initial = await lesson.apply(files, false, lesson.plan(files, false).token);
  const reordered = files.map(file => ({ ...file }));
  reordered[0].text = `---\nmodel: ${defaults.model}\nname: ${defaults.agentName}\n---\n\n${defaults.system}\n`;
  assert.equal(lesson.plan(reordered, false).summary.unchanged, 2);
  const renamed = definitionFiles({ ...defaults, agentName: 'Renamed display label' });
  const updated = await lesson.apply(renamed, false, lesson.plan(renamed, false).token);
  assert.equal(updated.history.at(-1)?.agentId, initial.history[0].agentId);
});

test('missing lock mappings and renamed files predict new resources while retaining the old inventory', async () => {
  const { store, lesson } = await fixture();
  const files = definitionFiles(defaults);
  const initial = await lesson.apply(files, false, lesson.plan(files, false).token);
  const missing = lesson.plan(files, true);
  assert.equal(missing.summary.created, 2);
  assert.ok(missing.warnings.length > 0);
  assert.deepEqual(store.snapshot(), initial);
  const duplicated = await lesson.apply(files, true, missing.token);
  assert.equal(duplicated.remote.length, 4);
  assert.notEqual(duplicated.history[1].agentId, initial.history[0].agentId);
  const renamed = definitionFiles({ ...defaults, agentPath: './agents/reviewer-renamed.md' });
  const plan = lesson.plan(renamed, false);
  assert.equal(plan.summary.created, 1);
  assert.ok(plan.warnings.some(warning => warning.includes('./agents/reviewer.md')));
});

test('stale plans, concurrent applies and remote drift prevent unintended writes', async () => {
  const { store, lesson } = await fixture();
  const files = definitionFiles(defaults);
  const plan = lesson.plan(files, false);
  const applying = lesson.apply(files, false, plan.token);
  await assert.rejects(lesson.apply(files, false, plan.token), /in progress/);
  await applying;
  await assert.rejects(lesson.apply(files, false, plan.token), /stale/);
  const state = store.snapshot();
  state.remote.find(resource => resource.kind === 'agent')!.config.system = 'Edited outside the definitions';
  await store.save(state);
  const drift = lesson.plan(files, false);
  assert.equal(drift.blocked, true);
  await assert.rejects(lesson.apply(files, false, drift.token), /differs from its last recorded state/);
});

test('failed snapshot commit leaves the previous published state intact', async () => {
  const original = await fixture();
  class FailingStore extends ClassroomStore {
    override save(_state: State): Promise<State> { return Promise.reject(new Error('Disk unavailable')); }
  }
  const store = new FailingStore(original.store.file);
  await store.load();
  const lesson = new Reconciler(store);
  const files = definitionFiles(defaults);
  await assert.rejects(lesson.apply(files, false, lesson.plan(files, false).token), /Disk unavailable/);
  assert.equal(store.snapshot().remote.length, 0);
  assert.equal(store.snapshot().lock, null);
  assert.throws(() => parseDefinitions([{ path: './agents/reviewer.md', text: 'name: missing frontmatter' }, files[1]]), /frontmatter/);
});
