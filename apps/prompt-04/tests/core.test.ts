import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyClient } from '../src/api-client.js';
import { cliLoginClient } from '../src/cli-client.js';
import { runClassroom } from '../src/classroom.js';
import { safeFailure, verifyAgent } from '../src/verify.js';

test('missing key fails before SDK construction; read-only API-key verification formats authentication', async () => {
  assert.throws(() => apiKeyClient({ ANTHROPIC_API_KEY:'  ' }), /ANTHROPIC_API_KEY/);
  let calls = 0;
  const client = apiKeyClient({ ANTHROPIC_API_KEY:'fixture-secret', ANTHROPIC_WORKSPACE_ID:'wrkspc_fixture' }, {
    fetch: async (url, init) => {
      calls++;
      const request = new Request(url, init);
      assert.equal(request.method, 'GET');
      assert.equal(new URL(request.url).pathname, '/v1/agents/agent_fixture');
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-secret');
      assert.equal(request.headers.get('anthropic-workspace-id'), 'wrkspc_fixture');
      assert.ok(request.headers.get('anthropic-beta')?.includes('managed-agents-2026-04-01'));
      return new Response(JSON.stringify({ id:'agent_fixture', type:'agent' }), { headers:{ 'Content-Type':'application/json' } });
    },
  });
  await assert.rejects(verifyAgent(client, '  '), /AGENT_ID/);
  assert.equal(calls, 0);
  assert.equal((await verifyAgent(client, 'agent_fixture')).id, 'agent_fixture');
  assert.equal(calls, 1);
});

test('both classroom paths distinguish missing, rejected, denied and inaccessible credentials/resources', async () => {
  for (const mode of ['api-key', 'cli-login'] as const) {
    const missing = await runClassroom({ mode, credential:'missing', resource:'allowed' });
    assert.equal(missing.requests, 0);
    assert.equal(missing.status, null);
    for (const [credential, resource, status] of [
      ['valid','allowed',200], ['invalid','allowed',401], ['valid','forbidden',403], ['valid','not-found',404],
    ] as const) {
      const report = await runClassroom({ mode, credential, resource });
      assert.equal(report.status, status, JSON.stringify(report));
      assert.ok(report.requests >= 1);
      const serialized = JSON.stringify(report);
      assert.ok(serialized.includes('[REDACTED]'));
      assert.ok(!serialized.includes('classroom-accepted-placeholder'));
      assert.ok(!serialized.includes('classroom-rejected-placeholder'));
    }
  }
});

test('pinned SDK reads a synthetic named OAuth profile and overrides environment credentials', async () => {
  const dir = new URL('../.runtime/profile-fixture/', import.meta.url);
  await mkdir(new URL('configs/', dir), { recursive:true });
  await mkdir(new URL('credentials/', dir), { recursive:true });
  await writeFile(new URL('configs/lesson.json', dir), JSON.stringify({
    version:'1.0', workspace_id:'wrkspc_fixture', authentication:{ type:'user_oauth' },
  }));
  await writeFile(new URL('credentials/lesson.json', dir), JSON.stringify({
    version:'1.0', type:'oauth_token', access_token:'synthetic-profile-access-token',
    expires_at:Math.floor(Date.now() / 1000) + 3600,
  }), { mode:0o600 });
  const keys = ['ANTHROPIC_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.ANTHROPIC_CONFIG_DIR = fileURLToPath(dir);
  process.env.ANTHROPIC_API_KEY = 'synthetic-environment-key-must-not-win';
  process.env.ANTHROPIC_AUTH_TOKEN = 'synthetic-environment-token-must-not-win';
  let requests = 0;
  try {
    const client = cliLoginClient({ ANTHROPIC_PROFILE:'lesson' }, { fetch:async (url, init) => {
      requests++;
      const request = new Request(url, init);
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-profile-access-token');
      assert.equal(request.headers.get('anthropic-workspace-id'), 'wrkspc_fixture');
      assert.equal(new URL(request.url).pathname, '/v1/agents/agent_fixture');
      return new Response(JSON.stringify({ id:'agent_fixture' }), { headers:{ 'Content-Type':'application/json' } });
    } });
    assert.equal((await verifyAgent(client, 'agent_fixture')).id, 'agent_fixture');
    assert.equal(requests, 1);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('safe failures omit raw credential-bearing provider error bodies', () => {
  const error = new Anthropic.AuthenticationError(401, { message:'secret-that-must-not-be-logged' }, 'secret-that-must-not-be-logged', new Headers());
  const failure = safeFailure(error);
  assert.equal(failure.status, 401);
  assert.ok(!JSON.stringify(failure).includes('secret-that-must-not-be-logged'));
});

test('CLI exits before a request when required server configuration is missing', () => {
  for (const flags of [[], ['--cli']]) {
    const result = spawnSync(process.execPath, ['--import','tsx','src/main.ts', ...flags], {
      cwd:new URL('../', import.meta.url), encoding:'utf8',
      env:{ ...process.env, AGENT_ID:'', ANTHROPIC_API_KEY:'synthetic-secret' },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('No request sent'));
    assert.ok(!result.stderr.includes('synthetic-secret'));
  }
});
