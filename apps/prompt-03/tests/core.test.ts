import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSession, createClient, hasSessions } from '../src/client.js';
import { validateConfig } from '../src/config.js';
import { preflight } from '../src/preflight.js';

const valid = { ANTHROPIC_API_KEY:'test-secret-never-return', AGENT_ID:'agent_test', ENVIRONMENT_ID:'env_test' };

test('every required field fails before the client or request is created', async () => {
  let clientCreations = 0;
  for (const field of Object.keys(valid)) {
    for (const value of [undefined, '', '  ']) {
      const input = { ...valid, [field]:value };
      assert.equal(validateConfig(input).ok, false);
      await assert.rejects(createSession(input, () => {
        clientCreations++;
        throw new Error('Should not construct client');
      }), new RegExp(field));
      const report = preflight(input);
      assert.equal(report.ready, false);
      assert.equal(report.providerRequests, 0);
      assert.ok(!JSON.stringify(report).includes(valid.ANTHROPIC_API_KEY));
    }
  }
  assert.equal(clientCreations, 0);
});

test('installed SDK exposes sessions; injected fault blocks the request plan', () => {
  assert.equal(hasSessions(createClient(valid)), true);
  const good = preflight(valid);
  assert.equal(good.ready, true);
  assert.equal(good.runtime.sdk, '1.8.0');
  assert.deepEqual(good.requestPlan?.body, { agent:'agent_test', environment_id:'env_test' });
  assert.ok(!JSON.stringify(good).includes(valid.ANTHROPIC_API_KEY));
  const bad = preflight(valid, true);
  assert.equal(bad.ready, false);
  assert.equal(bad.requestPlan, undefined);
  assert.equal(bad.providerRequests, 0);
});

test('real SDK serializes session parameters and beta header with one local request', async () => {
  let requests = 0;
  const session = await createSession(valid, config => {
    const client = createClient(config, { fetch: async (input, init) => {
      requests++;
      const request = new Request(input, init);
      assert.equal(new URL(request.url).pathname, '/v1/sessions');
      assert.ok(request.headers.get('anthropic-beta')?.includes('managed-agents-2026-04-01'));
      assert.equal(request.headers.get('authorization'), `Bearer ${valid.ANTHROPIC_API_KEY}`);
      assert.deepEqual(await request.json(), { agent:valid.AGENT_ID, environment_id:valid.ENVIRONMENT_ID });
      return new Response(JSON.stringify({ id:'sesn_local_fixture', type:'session', status:'idle' }), {
        status:200, headers:{ 'Content-Type':'application/json' },
      });
    } });
    return client;
  });
  assert.equal(session.id, 'sesn_local_fixture');
  assert.equal(requests, 1);
});

test('CLI validates offline, reports only safe values and exits nonzero for missing config', () => {
  const run = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: new URL('../', import.meta.url), env, encoding:'utf8',
  });
  const success = run({ ...process.env, ...valid });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).providerRequests, 0);
  assert.ok(!success.stdout.includes(valid.ANTHROPIC_API_KEY));
  const failure = run({ ...process.env, ...valid, AGENT_ID:'' });
  assert.equal(failure.status, 1);
  assert.equal(JSON.parse(failure.stdout).issues[0].field, 'AGENT_ID');
});
