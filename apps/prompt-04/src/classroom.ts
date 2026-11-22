import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { safeFailure, verifyAgent } from './verify.js';

export const lessonInput = z.object({
  mode: z.enum(['api-key', 'cli-login']),
  credential: z.enum(['valid', 'missing', 'invalid']),
  resource: z.enum(['allowed', 'forbidden', 'not-found']),
});
export type LessonInput = z.infer<typeof lessonInput>;

// Only synthetic fixtures are used here. Real credentials never enter this lab.
export async function runClassroom(input: LessonInput) {
  const trace = [{ step: 'Credential source', detail: input.mode === 'api-key' ? 'Server environment (synthetic)' : 'Local login provider (synthetic)' }];
  if (input.credential === 'missing') return {
    outcome: 'blocked', status: null, requests: 0, trace,
    message: input.mode === 'api-key' ? 'API key missing. Configure ANTHROPIC_API_KEY on the server.' : 'Login missing. Run ant auth login --profile lesson in your terminal.',
    evidence: { scope: 'Local fixture', sent: false, reason: 'No credential available' },
  };

  let requests = 0;
  let requestEvidence: Record<string, unknown> = {};
  const syntheticSecret = input.credential === 'valid' ? 'classroom-accepted-placeholder' : 'classroom-rejected-placeholder';
  const client = new Anthropic({
    ...(input.mode === 'api-key' ? { apiKey: syntheticSecret } : {
      // Models the credential provider AFTER CLI login; no real profile is read.
      credentials: async () => ({ token: syntheticSecret, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    }),
    baseURL: 'https://classroom.invalid', maxRetries: 0, timeout: 5000,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    fetch: async (url, init) => {
      requests++;
      const request = new Request(url, init);
      requestEvidence = { method: request.method, path: new URL(request.url).pathname,
        headers: { Authorization: request.headers.has('authorization') ? 'Bearer [REDACTED]' : '[MISSING]',
          'anthropic-beta': request.headers.get('anthropic-beta') },
        transport: 'In-process fetch fixture; no network connection' };
      const authorized = request.headers.get('authorization') === 'Bearer classroom-accepted-placeholder';
      const status = !authorized ? 401 : input.resource === 'forbidden' ? 403 : input.resource === 'not-found' ? 404 : 200;
      const body = status === 200 ? { id: 'agent_classroom', type: 'agent', name: 'Classroom agent' }
        : { type: 'error', error: { type: status === 401 ? 'authentication_error' : status === 403 ? 'permission_error' : 'not_found_error', message: 'Synthetic provider response' } };
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'request-id': 'classroom-fixture' } });
    },
  });
  trace.push({ step: 'Server-side SDK', detail: 'Credential attached privately; retries disabled' });
  try {
    const agent = await verifyAgent(client, 'agent_classroom');
    trace.push({ step: 'Resource access', detail: '200 · accessible agent returned by fixture' });
    return { outcome: 'success', status: 200, requests, trace,
      message: 'Fixture accepted the credential and allowed access to this agent.',
      evidence: { scope: 'Local fixture', request: requestEvidence, response: { status: 200, agentId: agent.id } } };
  } catch (error) {
    const failure = safeFailure(error);
    trace.push({ step: 'Resource access', detail: `${failure.status ?? 'No status'} · ${failure.message}` });
    return { outcome: 'failed', status: failure.status, requests, trace, message: failure.message,
      evidence: { scope: 'Local fixture', request: requestEvidence, response: failure } };
  }
}
