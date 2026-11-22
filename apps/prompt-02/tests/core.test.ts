import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ArchitectureLesson } from '../src/lesson.js';
import { SessionStore } from '../src/core.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-02-test-'));
  const file = join(directory, 'sessions.json');
  const store = new SessionStore(file);
  await store.load();
  return { file, store, lesson: new ArchitectureLesson(store), cleanup: async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.startsWith(join(tmpdir(), 'prompt-02-test-'))) throw new Error('Unexpected test directory');
    await rm(directory, { recursive: true, force: true });
  } };
}

test('reused definitions create independent sessions and survive reload', async () => {
  const f = await fixture();
  try {
    const first = await f.lesson.create('demo', 'demo_agent_tutor', 'demo_env_cloud');
    const second = await f.lesson.create('demo', 'demo_agent_tutor', 'demo_env_cloud');
    assert.notEqual(first.id, second.id);
    await f.lesson.send(first.id, 'Explain architecture.', true, new AbortController(), () => {});
    assert.equal(f.lesson.get(first.id).events.filter(e => e.type === 'agent.message').length, 1);
    assert.equal(f.lesson.get(second.id).events.filter(e => e.type === 'agent.message').length, 0);
    const restored = new SessionStore(f.file);
    await restored.load();
    assert.deepEqual(restored.all(), f.store.all());
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).length, 2);
  } finally { await f.cleanup(); }
});

test('missing references leave the store unchanged', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.lesson.create('demo', 'demo_agent_tutor', 'demo_env_missing'), /Environment reference/);
    assert.equal(f.store.all().length, 0);
    assert.throws(() => f.lesson.get('unregistered'), /not registered/);
  } finally { await f.cleanup(); }
});

test('cancellation restores an idle demo session and concurrent turns are rejected', async () => {
  const f = await fixture();
  try {
    const session = await f.lesson.create('demo', 'demo_agent_tutor', 'demo_env_cloud');
    const controller = new AbortController();
    const active = f.lesson.send(session.id, 'First task.', false, controller, () => {});
    await assert.rejects(f.lesson.send(session.id, 'Concurrent task.', true, new AbortController(), () => {}), /active turn/);
    controller.abort();
    await assert.rejects(active);
    assert.equal(f.lesson.get(session.id).status, 'idle');
    assert.equal(f.lesson.get(session.id).stopReason, 'interrupted');
  } finally { await f.cleanup(); }
});

test('live SDK wiring opens the stream first and reconciles paginated history without duplicates', async () => {
  const f = await fixture();
  let writeEvents: (() => void) | undefined;
  const providerEvents = [
    { id: 'fixture-1', type: 'user.message', content: [{ type: 'text', text: 'Explain architecture.' }] },
    { id: 'fixture-2', type: 'session.status_running' },
    { id: 'fixture-3', type: 'agent.message', content: [{ type: 'text', text: 'A session uses an agent and environment.' }] },
    { id: 'fixture-4', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
  ];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/sessions') {
      assert.equal(JSON.parse(text).agent, 'fixture-agent');
      res.end('{"id":"fixture-session","status":"idle"}');
    } else if (req.method === 'GET' && req.url?.includes('/stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders();
      writeEvents = () => { for (const value of providerEvents) res.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`); res.end(); };
    } else if (req.method === 'POST' && req.url === '/v1/sessions/fixture-session/events') {
      assert.ok(writeEvents, 'stream opens first');
      assert.equal(JSON.parse(text).events[0].type, 'user.message');
      res.end('{}'); writeEvents();
    } else if (req.url === '/v1/sessions/fixture-session') {
      res.end('{"id":"fixture-session","status":"idle"}');
    } else if (req.url?.startsWith('/v1/sessions/fixture-session/events')) {
      const next = req.url.includes('page=fixture-next');
      const data = next ? providerEvents.slice(2) : providerEvents.slice(0, 2);
      res.end(JSON.stringify({ data, next_page: next ? null : 'fixture-next' }));
    } else { res.writeHead(404); res.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'MANAGED_AGENT_ID', 'MANAGED_ENVIRONMENT_ID'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'fixture-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
    MANAGED_AGENT_ID: 'fixture-agent', MANAGED_ENVIRONMENT_ID: 'fixture-env' });
  try {
    const session = await f.lesson.create('live', 'fixture-agent', 'fixture-env');
    await f.lesson.send(session.id, 'Explain architecture.', true, new AbortController(), () => {});
    await f.lesson.inspect(session.id);
    const inspected = await f.lesson.inspect(session.id);
    assert.equal(inspected.events.filter(e => e.source === 'provider').length, 4);
    assert.equal(new Set(inspected.events.map(e => e.id)).size, inspected.events.length);
    assert.equal(inspected.stopReason, 'end_turn');
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await f.cleanup();
  }
});
