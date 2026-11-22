import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const BETA = 'managed-agents-2026-04-01';
export const API_VERSION = '2026-10-21';
export const inputSchema = z.object({
  sdkMode: z.enum(['automatic', 'explicit']),
  rawBeta: z.enum(['valid', 'missing', 'unsupported']),
  rawVersion: z.enum(['current', 'missing', 'unsupported']),
  rawAuth: z.enum(['bearer', 'x-api-key', 'missing']),
  differentBody: z.boolean(),
});
export type Input = z.infer<typeof inputSchema>;
export const defaults: Input = { sdkMode: 'automatic', rawBeta: 'valid',
  rawVersion: 'current', rawAuth: 'bearer', differentBody: false };
export type SessionBody = { agent: string; environment_id: string };
export const demoBody: SessionBody = { agent: 'demo_agent_reviewer', environment_id: 'demo_environment_cloud' };

export function rawBody(input: Input): SessionBody {
  return { ...demoBody, agent: input.differentBody ? 'demo_agent_alternate' : demoBody.agent };
}

export async function sdkSession(client: Anthropic, body: SessionBody, explicit = false) {
  return client.beta.sessions.create(body, explicit ? {
    headers: { 'anthropic-beta': BETA },
  } : undefined);
}

export function rawHeaders(input: Input, apiKey: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (input.rawAuth === 'bearer') headers.set('Authorization', `Bearer ${apiKey}`);
  if (input.rawAuth === 'x-api-key') headers.set('x-api-key', apiKey);
  if (input.rawVersion !== 'missing') headers.set('anthropic-version', input.rawVersion === 'current' ? API_VERSION : '2099-01-01');
  if (input.rawBeta !== 'missing') headers.set('anthropic-beta', input.rawBeta === 'valid' ? BETA : 'managed-agents-2099-01-01');
  return headers;
}

export async function httpSession(
  transport: typeof fetch, url: string, headers: Headers, body: SessionBody,
) {
  return transport(url, { method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000) });
}

export async function inspectRequest(request: Request) {
  const headers = request.headers;
  const safeHeaders: Record<string, string> = {};
  for (const name of ['anthropic-version', 'anthropic-beta', 'content-type']) {
    const value = headers.get(name);
    if (value !== null) safeHeaders[name] = value;
  }
  if (headers.has('authorization')) safeHeaders.authorization = 'Bearer [REDACTED]';
  if (headers.has('x-api-key')) safeHeaders['x-api-key'] = '[REDACTED]';
  return { method: request.method, endpoint: new URL(request.url).pathname,
    headers: safeHeaders, body: await request.clone().json() as SessionBody };
}
export type RequestProjection = Awaited<ReturnType<typeof inspectRequest>>;

export function snippets(input: Input) {
  const options = input.sdkMode === 'explicit'
    ? `, {\n  headers: { "anthropic-beta": "${BETA}" },\n}` : '';
  const sdk = `import Anthropic from "@anthropic-ai/sdk";\n\nconst client = new Anthropic({\n  apiKey: process.env.ANTHROPIC_API_KEY,\n  maxRetries: 0,\n});\n\n// SDK 1.8.0 supplies authentication, the base API version\n// and this endpoint's required Managed Agents beta header.\nconst session = await client.beta.sessions.create(${JSON.stringify(demoBody, null, 2)}${options});\nconsole.log(session.id);`;
  const headers = rawHeaders(input, '<API_KEY>');
  const headerText = [...headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n');
  const http = `POST /v1/sessions HTTP/1.1\nHost: api.anthropic.com\n${headerText}\n\n${JSON.stringify(rawBody(input), null, 2)}`;
  return { sdk, http };
}
