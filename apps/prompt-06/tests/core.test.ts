import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { defaultProfile, compareProfiles, effectiveProfile, agentRequest, generatedCode } from '../src/profile.js';
import { classroomTest } from '../src/classroom.js';
import { reproduceAgent, testAgent, inspectSession } from '../src/reproduce.js';

test('comparison detects each configuration difference and ignores unused tool permission', () => {
  assert.ok(compareProfiles(defaultProfile, { ...defaultProfile }).every(row => row.matches));
  const changes = [
    { model: 'classroom-alternate' as const },
    { system: 'Give a short answer.' },
    { tool: 'read' as const, permission: 'always_ask' as const },
    { environment: 'demo_env_open' as const },
    { task: 'Different test input' },
  ];
  for (const [index, change] of changes.entries()) {
    const differences = compareProfiles(defaultProfile, { ...defaultProfile, ...change });
    assert.equal(differences.filter(row => !row.matches).length, 1);
    assert.equal(differences[index].matches, false);
  }
  assert.ok(compareProfiles(defaultProfile, { ...defaultProfile, permission: 'always_ask' }).every(row => row.matches));
});

test('equivalent tests allow different wording while reuse keeps the tested agent and skips creation', async () => {
  const baseline = await classroomTest(defaultProfile, 'console', 'reproduce');
  const reproduced = await classroomTest(defaultProfile, 'api', 'reproduce');
  assert.notEqual(baseline.agentId, reproduced.agentId);
  assert.notEqual(baseline.response, reproduced.response);
  assert.deepEqual(baseline.observedTools, reproduced.observedTools);
  assert.equal(baseline.stopReason, reproduced.stopReason);
  const changed = { ...defaultProfile, model: 'classroom-alternate' as const, environment: 'demo_env_open' as const };
  const effective = effectiveProfile(defaultProfile, changed, 'reuse');
  assert.equal(effective.model, defaultProfile.model);
  assert.equal(effective.environment, changed.environment);
  const reused = await classroomTest(effective, 'api', 'reuse', baseline.agentId);
  assert.equal(reused.agentId, baseline.agentId);
  assert.equal(reused.requests.filter(request => request.path === '/v1/agents').length, 0);
  assert.ok(!generatedCode(effective, 'reuse', baseline.agentId).includes('agents.create'));
});

test('read tool permission is encoded accurately and confirmation pauses the fixture', async () => {
  const profile = { ...defaultProfile, tool: 'read' as const, permission: 'always_ask' as const };
  assert.deepEqual(agentRequest(profile).tools, [{ type: 'agent_toolset_20260401', default_config: { enabled: false },
    configs: [{ name: 'read', type: 'read', enabled: true, permission_policy: { type: 'always_ask' } }] }]);
  const result = await classroomTest(profile, 'api', 'reproduce');
  assert.equal(result.stopReason, 'requires_action');
  assert.equal(result.response, '');
  assert.deepEqual(result.observedTools, ['read']);
  const permitted = await classroomTest({ ...profile, permission: 'always_allow' }, 'api', 'reproduce');
  assert.equal(permitted.stopReason, 'end_turn');
  assert.ok(permitted.response.includes('Friday'));
});

test('real SDK reproduces copied fields, preserves model settings and paginates observations', async () => {
  const request = { ...agentRequest(defaultProfile), model: { id: 'fixture-model', speed: 'standard' as const },
    metadata: { purpose: 'learning', source: 'Console' } };
  const client = new Anthropic({ apiKey: 'fixture-secret', maxRetries: 0,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    fetch: async (url, init) => {
      const outgoing = new Request(url, init);
      const parsed = new URL(outgoing.url);
      assert.ok(outgoing.headers.get('anthropic-beta')?.includes('managed-agents-2026-04-01'));
      let response;
      if (parsed.pathname === '/v1/agents') {
        assert.deepEqual(await outgoing.json(), request);
        response = { id: 'agent_fixture' };
      } else if (parsed.pathname === '/v1/sessions') {
        assert.deepEqual(await outgoing.json(), { agent: 'agent_fixture', environment_id: 'env_fixture',
          initial_events: [{ type: 'user.message', content: [{ type: 'text', text: defaultProfile.task }] }] });
        response = { id: 'session_fixture' };
      } else if (parsed.pathname.endsWith('/events')) {
        response = parsed.searchParams.has('page')
          ? { data: [{ id: 'idle', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }], next_page: null }
          : { data: [{ id: 'answer', type: 'agent.message', content: [{ type: 'text', text: 'Friday' }] }], next_page: 'next' };
      } else response = { id: 'session_fixture', status: 'idle' };
      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const agent = await reproduceAgent(client, request);
  const session = await testAgent(client, agent.id, 'env_fixture', defaultProfile.task);
  const result = await inspectSession(client, session.id);
  assert.equal(result.events.length, 2);
  assert.equal(result.stopReason, 'end_turn');
});

test('scripted evidence quotes only phrases present in the supplied test input', async () => {
  const result = await classroomTest({ ...defaultProfile, task: 'No schedule or owner details are supplied.' }, 'console', 'reproduce');
  assert.ok(result.response.includes('not supplied'));
  assert.ok(!result.response.includes('Evidence:'));
  const exact = await classroomTest({ ...defaultProfile, task: 'RELEASE IS Monday. OWNER IS Lee.' }, 'console', 'reproduce');
  assert.ok(exact.response.includes('“RELEASE IS Monday”'));
  assert.ok(exact.response.includes('“OWNER IS Lee”'));
});
