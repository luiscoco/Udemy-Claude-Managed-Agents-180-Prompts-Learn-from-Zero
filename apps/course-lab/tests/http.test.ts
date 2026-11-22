import { test } from 'node:test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:4090';
async function client() {
  const response = await fetch(`${origin}/api/lesson/9`); const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const request = async (path: string, body?: unknown, custom: Record<string, string> = {}) => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...custom }, body: body ? JSON.stringify(body) : undefined });
  return request;
}
test('browser owners have isolated saved lesson state and downloads', async () => {
  const alice = await client(), bob = await client();
  const created = await alice('/api/lesson/9/action', { action: 'create', revision: 0, input: { name: 'Owned by first browser' } }); assert.equal(created.status, 200);
  const first = await (await alice('/api/lesson/9')).json(); const second = await (await bob('/api/lesson/9')).json();
  assert.equal(first.state.resources.agent.name, 'Owned by first browser'); assert.equal(second.state.revision, 0); assert.equal(second.state.resources.agent, undefined);
  assert.equal((await bob('/api/lesson/9/download?name=summary.csv')).status, 404);
});
test('stale mutations, unknown actions, invalid controls and foreign origins are rejected', async () => {
  const request = await client();
  assert.equal((await request('/api/lesson/9/action', { action: 'create', revision: 0, input: {} })).status, 200);
  assert.equal((await request('/api/lesson/9/action', { action: 'create', revision: 0, input: {} })).status, 409);
  assert.equal((await request('/api/lesson/9/action', { action: 'arbitrary-shell', revision: 1, input: {} })).status, 400);
  assert.equal((await request('/api/lesson/14/action', { action: 'validate', revision: 0, input: { region: 'invalid' } })).status, 400);
  assert.equal((await request('/api/lesson/9/reset', {}, { Origin: 'https://foreign.example.test' })).status, 403);
  const unchanged = await (await request('/api/lesson/9')).json(); assert.equal(unchanged.state.revision, 1);
});
test('downloaded CSV contains computed source totals; file paths stay in a virtual namespace', async () => {
  const request = await client();
  await request('/api/lesson/101/action', { action: 'generate', revision: 0, input: {} });
  const listed = await request('/api/lesson/101/action', { action: 'list', revision: 1, input: {} }); assert.equal(listed.status, 200);
  await request('/api/lesson/101/action', { action: 'download', revision: 2, input: {} });
  const csv = await request('/api/lesson/101/download?name=summary.csv'); assert.equal(csv.status, 200); assert.match(await csv.text(), /TOTAL,440/);
  const read = await (await request('/api/lesson/49/action', { action: 'read', revision: 0, input: { path: 'C:/Windows/win.ini' } })).json(); assert.equal(read.state.result.accepted, false);
});
