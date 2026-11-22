import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { State } from './storage.js';

export function classroomClient(snapshot: () => State) {
  return new Anthropic({
    apiKey: 'synthetic-classroom-placeholder',
    baseURL: 'https://classroom.invalid', maxRetries: 0,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    fetch: async (url, init) => {
      const request = new Request(url, init);
      const path = new URL(request.url).pathname;
      const state = snapshot();
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
        status, headers: { 'Content-Type': 'application/json' },
      });
      if (request.method === 'POST') {
        const body = await request.json() as Record<string, unknown>;
        if (path === '/v1/agents') {
          if (body.model !== 'classroom-model') return json({ type: 'error', error: {
            type: 'invalid_request_error', message: 'Unsupported classroom model',
          } }, 400);
          return json({ id: `demo_agent_${randomUUID()}`, type: 'agent', ...body });
        }
        if (path === '/v1/environments') return json({ id: `demo_env_${randomUUID()}`, type: 'environment', ...body });
        if (path === '/v1/sessions' && body.agent === state.agentId && body.environment_id === state.environmentId) {
          return json({ id: `demo_session_${randomUUID()}`, type: 'session', status: 'running' });
        }
      }
      if (state.sessionId && path === `/v1/sessions/${state.sessionId}/events`) {
        const events: Record<string, unknown>[] = [
          { id: `${state.sessionId}_user`, type: 'user.message', content: [{ type: 'text', text: state.task }] },
          { id: `${state.sessionId}_running`, type: 'session.status_running' },
        ];
        if (state.polls >= 2) {
          const answer = state.task === 'What is 2 + 2?'
            ? '2 + 2 = 4. Adding two items to two more items gives four items in total.'
            : 'The agent defines the model and instructions. The environment defines the sandbox. A session connects those resources and stores the task and response events.';
          events.push(
            { id: `${state.sessionId}_answer`, type: 'agent.message', content: [{ type: 'text', text: answer }] },
            { id: `${state.sessionId}_idle`, type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
          );
        }
        return json({ data: events, next_page: null });
      }
      if (state.sessionId && path === `/v1/sessions/${state.sessionId}`) {
        return json({ id: state.sessionId, type: 'session', status: state.polls >= 2 ? 'idle' : 'running' });
      }
      return json({ type: 'error', error: { type: 'not_found_error', message: 'Classroom resource unavailable' } }, 404);
    },
  });
}
