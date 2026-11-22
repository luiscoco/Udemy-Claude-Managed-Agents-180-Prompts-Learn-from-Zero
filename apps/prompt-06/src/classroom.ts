import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { agentRequest, type Profile, type Strategy } from './profile.js';
import { reproduceAgent, testAgent, inspectSession } from './reproduce.js';

export async function classroomTest(profile: Profile, origin: 'console' | 'api', strategy: Strategy, existingId?: string) {
  const requests: { method: string; path: string }[] = [];
  const newAgentId = `demo_${origin}_agent_${randomUUID()}`;
  const sessionId = `demo_${origin}_session_${randomUUID()}`;
  const needsAction = profile.tool === 'read' && profile.permission === 'always_ask';
  const cited = /cite|evidence/i.test(profile.system);
  const dayMatch = profile.task.match(/\brelease is (\w+)/i);
  const ownerMatch = profile.task.match(/\bowner is (\w+)/i);
  const day = dayMatch?.[1] || 'not supplied';
  const owner = ownerMatch?.[1] || 'not supplied';
  const facts = `Release day: ${day}. Owner: ${owner}.`;
  const quotes = [dayMatch?.[0], ownerMatch?.[0]].filter(Boolean);
  const evidence = cited && quotes.length > 0
    ? ` Evidence: ${quotes.map(quote => `“${quote}”`).join(' and ')}.` : '';
  const response = `${origin === 'console' ? 'Review findings' : 'API review'} — ${facts}${evidence}`;
  const events: Record<string, unknown>[] = [
    { id: 'fixture_user', type: 'user.message', content: [{ type: 'text', text: profile.task }] },
    { id: 'fixture_running', type: 'session.status_running' },
  ];
  if (profile.tool === 'read') events.push({ id: 'fixture_tool', type: 'agent.tool_use', name: 'read', input: { file_path: 'review.txt' } });
  if (!needsAction) events.push({ id: 'fixture_reply', type: 'agent.message', content: [{ type: 'text', text: response }] });
  events.push({ id: 'fixture_idle', type: 'session.status_idle', stop_reason: {
    type: needsAction ? 'requires_action' : 'end_turn', ...(needsAction ? { event_ids: ['fixture_tool'] } : {}),
  } });

  const client = new Anthropic({
    apiKey: 'synthetic-classroom-placeholder', baseURL: 'https://classroom.invalid', maxRetries: 0,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    fetch: async (url, init) => {
      const request = new Request(url, init);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      let body: unknown;
      if (path === '/v1/agents' && request.method === 'POST') body = { id: newAgentId };
      else if (path === '/v1/sessions' && request.method === 'POST') body = { id: sessionId, status: 'running' };
      else if (path === `/v1/sessions/${sessionId}/events`) body = { data: events, next_page: null };
      else if (path === `/v1/sessions/${sessionId}`) body = { id: sessionId, status: 'idle' };
      else return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  let agentId = existingId;
  if (strategy === 'reproduce') agentId = (await reproduceAgent(client, agentRequest(profile))).id;
  if (!agentId) throw new Error('A tested agent ID is required for reuse.');
  await testAgent(client, agentId, profile.environment, profile.task);
  const observed = await inspectSession(client, sessionId);
  return { ...observed, agentId, sessionId, requests, origin, scope: 'Scripted classroom fixture',
    response: observed.events.filter(event => event.type === 'agent.message').map(event => event.text).join('\n'),
    observedTools: observed.events.filter(event => event.type === 'agent.tool_use').map(event => event.tool),
    outcome: needsAction ? 'Needs confirmation' : 'Turn finished' };
}
export type TestResult = Awaited<ReturnType<typeof classroomTest>>;
