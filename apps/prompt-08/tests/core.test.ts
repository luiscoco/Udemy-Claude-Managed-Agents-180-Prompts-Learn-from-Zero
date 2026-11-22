import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPair } from '../src/classroom.js';
import { defaults, API_VERSION, BETA, demoBody, rawBody, snippets } from '../src/requests.js';

test('installed SDK supplies actual authentication, version and endpoint beta with matching HTTP semantics', async () => {
  for (const sdkMode of ['automatic', 'explicit'] as const) {
    const result = await runPair({ ...defaults, sdkMode });
    assert.equal(result.sdk.status, 200);
    assert.equal(result.http.status, 200);
    assert.equal(result.sdk.request.headers['anthropic-version'], API_VERSION);
    assert.equal(result.sdk.request.headers['anthropic-beta'], BETA);
    assert.equal(result.sdk.request.headers.authorization, 'Bearer [REDACTED]');
    assert.deepEqual(result.sdk.request.body, demoBody);
    assert.ok(result.rows.every(row => row.matches));
    assert.equal(result.created, 2);
    assert.equal(result.externalRequests, 0);
    const sdk = result.sdk.response as { id: string; status: string; agent: { id: string } };
    const http = result.http.response as { id: string; status: string; agent: { id: string } };
    assert.notEqual(sdk.id, http.id);
    assert.equal(sdk.status, 'idle');
    assert.equal(http.agent.id, sdk.agent.id);
  }
});

test('legacy API-key header remains semantically equivalent and credentials stay redacted', async () => {
  const result = await runPair({ ...defaults, rawAuth: 'x-api-key' });
  assert.equal(result.http.status, 200);
  assert.equal(result.http.request.headers['x-api-key'], '[REDACTED]');
  assert.ok(result.rows.every(row => row.matches));
  assert.ok(!JSON.stringify(result).includes('classroom-only-synthetic-key'));
  assert.ok(snippets({ ...defaults, rawAuth: 'x-api-key' }).http.includes('x-api-key: <API_KEY>'));
});

test('missing and unsupported raw headers fail in the fixture while the SDK request stays valid', async () => {
  for (const change of [{ rawBeta: 'missing' }, { rawBeta: 'unsupported' },
    { rawVersion: 'missing' }, { rawVersion: 'unsupported' }, { rawAuth: 'missing' }] as const) {
    const result = await runPair({ ...defaults, ...change });
    assert.equal(result.sdk.status, 200);
    assert.equal(result.http.status, 'rawAuth' in change ? 401 : 400);
    assert.equal(result.created, 1);
    assert.equal(result.rows.filter(row => !row.matches).length, 1);
  }
});

test('different body references remain a visible difference even when both requests are accepted', async () => {
  const input = { ...defaults, differentBody: true };
  const result = await runPair(input);
  assert.equal(result.created, 2);
  assert.deepEqual(result.http.request.body, rawBody(input));
  assert.equal(result.rows.find(row => row.field === 'Resource references')?.matches, false);
});

test('generated examples track selected headers and preserve the intended request JSON', () => {
  const example = snippets(defaults);
  const requestJson = example.http.slice(example.http.indexOf('\n\n') + 2);
  assert.deepEqual(JSON.parse(requestJson), demoBody);
  assert.ok(example.http.includes(`anthropic-version: ${API_VERSION}`));
  assert.ok(example.http.includes(`anthropic-beta: ${BETA}`));
  assert.ok(!snippets({ ...defaults, rawBeta: 'missing' }).http.includes('anthropic-beta:'));
  assert.ok(snippets({ ...defaults, sdkMode: 'explicit' }).sdk.includes(`"anthropic-beta": "${BETA}"`));
});
