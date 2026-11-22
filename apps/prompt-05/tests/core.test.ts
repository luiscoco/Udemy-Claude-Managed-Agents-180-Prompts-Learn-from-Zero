import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ResourceStore, type State } from '../src/storage.js';
import { AgentWorkflow, resourceIds } from '../src/workflow.js';
import { classroomClient } from '../src/classroom.js';

const settings = { name: 'Learning agent', model: 'classroom-model', system: 'Explain your results clearly.' };
async function fixtureStore() {
  const parent = new URL('../.runtime/core-tests/', import.meta.url);
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(fileURLToPath(parent), 'run-'));
  const store = new ResourceStore(join(directory, 'resource-ids.json'), 'demo');
  await store.load();
  return store;
}

test('SDK workflow saves IDs, distinguishes acceptance from completion, and resumes without duplicate creation', async () => {
  const store = await fixtureStore();
  const workflow = new AgentWorkflow(store, classroomClient(() => store.snapshot()));
  await assert.rejects(workflow.environment(), /agent first/);
  await workflow.agent(settings);
  const firstId = store.snapshot().agentId;
  const reloaded = new ResourceStore(store.file, 'demo');
  await reloaded.load();
  const resumed = new AgentWorkflow(reloaded, classroomClient(() => reloaded.snapshot()));
  await resumed.agent(settings);
  assert.equal(reloaded.snapshot().agentId, firstId);
  await resumed.environment();
  const accepted = await resumed.session('What is 2 + 2?');
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.events.length, 0);
  assert.ok(accepted.sessionId);
  const running = await resumed.observe();
  assert.equal(running.status, 'running');
  assert.equal(running.events.some(event => event.type === 'agent.message'), false);
  const finished = await resumed.observe();
  assert.equal(finished.status, 'idle');
  assert.equal(finished.stopReason, 'end_turn');
  assert.ok(finished.events.find(event => event.type === 'agent.message')?.text?.includes('2 + 2 = 4'));
  assert.equal((await resumed.session('Another task')).sessionId, accepted.sessionId);
  assert.deepEqual(resourceIds(JSON.parse(await readFile(reloaded.file, 'utf8'))), resourceIds(finished));
  assert.ok(!(await readFile(reloaded.file, 'utf8')).includes('synthetic-classroom-placeholder'));
});

test('definitive model rejection permits a corrected retry and concurrent clicks are rejected', async () => {
  const store = await fixtureStore();
  const workflow = new AgentWorkflow(store, classroomClient(() => store.snapshot()));
  await assert.rejects(workflow.agent({ ...settings, model: 'unsupported-model' }), Anthropic.BadRequestError);
  assert.equal(store.snapshot().agentId, null);
  assert.equal(store.snapshot().pending, null);
  const creating = workflow.agent(settings);
  await assert.rejects(workflow.agent(settings), /current operation/);
  await creating;
  assert.ok(store.snapshot().agentId);
});

test('real SDK uses expected creation payloads and follows paginated event history', async () => {
  const store = await fixtureStore();
  const calls: string[] = [];
  const client = new Anthropic({ apiKey: 'fixture-key', maxRetries: 0,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    fetch: async (url, init) => {
      const request = new Request(url, init);
      const parsed = new URL(request.url);
      calls.push(`${request.method} ${parsed.pathname}${parsed.search}`);
      assert.ok(request.headers.get('anthropic-beta')?.includes('managed-agents-2026-04-01'));
      let body: unknown;
      if (request.method === 'POST') {
        const input = await request.json();
        if (parsed.pathname === '/v1/agents') {
          assert.deepEqual(input, settings);
          body = { id: 'agent_fixture' };
        } else if (parsed.pathname === '/v1/environments') {
          assert.deepEqual(input, { name: 'learning-env', config: { type: 'cloud' } });
          body = { id: 'env_fixture' };
        } else {
          assert.deepEqual(input, { agent: 'agent_fixture', environment_id: 'env_fixture',
            initial_events: [{ type: 'user.message', content: [{ type: 'text', text: 'What is 2 + 2?' }] }] });
          body = { id: 'session_fixture', status: 'running' };
        }
      } else if (parsed.pathname.endsWith('/events')) {
        body = parsed.searchParams.get('page') === 'second'
          ? { data: [{ id: 'idle', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }], next_page: null }
          : { data: [{ id: 'answer', type: 'agent.message', content: [{ type: 'text', text: '4' }] }], next_page: 'second' };
      } else body = { id: 'session_fixture', status: 'idle' };
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const workflow = new AgentWorkflow(store, client);
  await workflow.agent(settings);
  await workflow.environment();
  await workflow.session('What is 2 + 2?');
  const state = await workflow.observe();
  assert.equal(state.events.length, 2);
  assert.equal(state.stopReason, 'end_turn');
  assert.ok(calls.includes('GET /v1/sessions/session_fixture/events?page=second'));
  assert.equal(calls.filter(call => call.startsWith('POST')).length, 3);
});

test('ambiguous creation failures retain saved IDs and prevent blind duplicate creation after restart', async () => {
  const store = await fixtureStore();
  await new AgentWorkflow(store, classroomClient(() => store.snapshot())).agent(settings);
  let calls = 0;
  const failing = new Anthropic({ apiKey: 'fixture', maxRetries: 0, fetch: async () => {
    calls++;
    throw new Error('Connection closed after creation may have been accepted');
  } });
  await assert.rejects(new AgentWorkflow(store, failing).environment());
  assert.equal(store.snapshot().pending, 'environment');
  assert.ok(store.snapshot().agentId);
  const restored = new ResourceStore(store.file, 'demo');
  await restored.load();
  await assert.rejects(new AgentWorkflow(restored, failing).environment(), /previous creation/);
  assert.equal(calls, 1);
});

test('disk failure after creation preserves pending intent and reports the recoverable resource ID', async () => {
  const original = await fixtureStore();
  class FailingStore extends ResourceStore {
    override save(state: State) {
      if (state.agentId) return Promise.reject(new Error('Disk unavailable'));
      return super.save(state);
    }
  }
  const store = new FailingStore(original.file, 'demo');
  const workflow = new AgentWorkflow(store, classroomClient(() => store.snapshot()));
  await assert.rejects(workflow.agent(settings), /Created agent demo_agent_/);
  assert.equal(store.snapshot().pending, 'agent');
  const persisted = JSON.parse(await readFile(store.file, 'utf8'));
  assert.equal(persisted.pending, 'agent');
});
