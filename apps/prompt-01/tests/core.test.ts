import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { sampleReport, analyzeLocally, parseAnalysis, buildTask, runInput, type RunEvent } from '../src/core.js';
import { runDemo, runLive } from '../src/adapters.js';

test('demo output uses actual source quotes, including edited documents', () => {
  for (const report of [sampleReport, 'Revenue grew 12%. A supplier contract will expire in 30 days without renewal.']) {
    const result = analyzeLocally(report);
    assert.ok(result.findings.length > 0);
    for (const item of [...result.findings, ...result.risks]) assert.ok(report.includes(item.quote));
  }
  assert.ok(analyzeLocally(sampleReport).risks.some(r => r.quote.includes('38%')));
  assert.match(analyzeLocally(sampleReport).findings[0].quote, /Revenue reached/);
  assert.equal(analyzeLocally('A short ordinary paragraph with a neutral statement about the project.').risks.length, 0);
});

test('all demo adapters analyze the same input and show different ownership', async () => {
  const owners = [];
  for (const product of ['managed', 'sdk', 'messages'] as const) {
    const events: RunEvent[] = [];
    const result = await runDemo(product, sampleReport, e => events.push(e), new AbortController().signal, true);
    assert.deepEqual(result, analyzeLocally(sampleReport));
    owners.push(events.filter(e => e.kind === 'step').map(e => e.owner).join(','));
  }
  assert.equal(new Set(owners).size, 3);
});

test('validation rejects fabricated citations, malformed JSON and missing findings', () => {
  const valid = analyzeLocally(sampleReport);
  assert.deepEqual(parseAnalysis('```json\n' + JSON.stringify(valid) + '\n```', sampleReport), valid);
  assert.throws(() => parseAnalysis('{bad}', sampleReport));
  assert.throws(() => parseAnalysis('{"findings":[],"risks":[]}', sampleReport));
  assert.throws(() => parseAnalysis(JSON.stringify({ findings: [{ text: 'Fabricated', quote: 'invented source' }], risks: [] }), sampleReport));
  assert.ok(buildTask(sampleReport).includes(sampleReport));
  assert.equal(runInput.safeParse({ product: 'wrong', mode: 'demo', report: sampleReport }).success, false);
});

test('demo cancellation stops the run', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runDemo('sdk', sampleReport, () => {}, controller.signal, false));
});

test('real Messages and Managed adapters work against an HTTP fixture using the installed SDK', async () => {
  const body = JSON.stringify(analyzeLocally(sampleReport));
  const calls: string[] = [];
  let sendEvent: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    calls.push(`${req.method} ${req.url}`);
    let requestBody = '';
    for await (const chunk of req) requestBody += chunk;
    if (req.url === '/v1/messages') {
      assert.ok(JSON.parse(requestBody).messages[0].content.includes(sampleReport));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'fixture-message', type: 'message', role: 'assistant', model: 'fixture-model',
        stop_reason: 'end_turn', content: [{ type: 'text', text: body }], usage: { input_tokens: 1, output_tokens: 1 } }));
    } else if (req.method === 'POST' && req.url === '/v1/sessions') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"id":"fixture-session"}');
    } else if (req.method === 'GET' && req.url?.includes('/stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.flushHeaders();
      sendEvent = () => {
        for (const event of [
          { type: 'session.status_running' },
          { type: 'agent.message', content: [{ type: 'text', text: body }] },
          { type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
        ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        res.end();
      };
    } else if (req.method === 'POST' && req.url === '/v1/sessions/fixture-session/events') {
      assert.equal(JSON.parse(requestBody).events[0].type, 'user.message');
      assert.ok(sendEvent, 'The stream must be opened before sending the task');
      res.setHeader('Content-Type', 'application/json');
      res.end('{"events":[]}');
      sendEvent();
    } else { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const previous = { ...process.env };
  Object.assign(process.env, { ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, ANTHROPIC_API_KEY: 'fixture-key',
    CLAUDE_MODEL: 'fixture-model', MANAGED_AGENT_ID: 'fixture-agent', MANAGED_ENVIRONMENT_ID: 'fixture-environment' });
  try {
    for (const product of ['messages', 'managed'] as const) {
      assert.deepEqual(await runLive(product, sampleReport, () => {}, new AbortController()), analyzeLocally(sampleReport));
    }
    assert.ok(calls.includes('POST /v1/messages'));
    assert.ok(calls.includes('POST /v1/sessions'));
  } finally {
    for (const name of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL', 'MANAGED_AGENT_ID', 'MANAGED_ENVIRONMENT_ID']) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
