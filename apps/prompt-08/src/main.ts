import Anthropic from '@anthropic-ai/sdk';
import { mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { API_VERSION, BETA, httpSession, sdkSession } from './requests.js';

const directory = new URL('../.runtime/', import.meta.url);
const record = new URL('live-sessions.jsonl', directory);
try {
  const required = ['ANTHROPIC_API_KEY', 'AGENT_ID', 'ENVIRONMENT_ID'];
  if (required.some(name => !process.env[name]?.trim())) throw new Error('Missing server configuration');
  await mkdir(directory, { recursive: true });
  const apiKey = process.env.ANTHROPIC_API_KEY!.trim();
  const body = { agent: process.env.AGENT_ID!.trim(), environment_id: process.env.ENVIRONMENT_ID!.trim() };
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const sharedHeaders: Record<string, string> = workspace ? { 'anthropic-workspace-id': workspace } : {};
  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', defaultHeaders: sharedHeaders,
    maxRetries: 0, timeout: 30000 });

  async function save(transport: string, id: string, status: string) {
    const created = { transport, id, status, ...body, at: new Date().toISOString() };
    console.log(JSON.stringify(created));
    await appendFile(record, JSON.stringify(created) + '\n', { mode: 0o600 });
  }
  const sdk = await sdkSession(client, body);
  await save('sdk', sdk.id, sdk.status);
  const response = await httpSession(fetch, 'https://api.anthropic.com/v1/sessions', new Headers({
    Authorization: `Bearer ${apiKey}`, 'anthropic-version': API_VERSION,
    'anthropic-beta': BETA, 'Content-Type': 'application/json', ...sharedHeaders,
  }), body);
  if (!response.ok) throw new Error('HTTP request failed');
  const http = await response.json() as { id: string; status: string };
  if (typeof http.id !== 'string' || typeof http.status !== 'string') throw new Error('Unexpected session response');
  await save('http', http.id, http.status);
} catch (error) {
  const status = error instanceof Anthropic.APIError ? error.status : null;
  console.error(JSON.stringify({ status,
    error: 'Check server configuration and account access. Inspect Console before retrying an uncertain creation.' }));
  console.error(`Creation record path ${fileURLToPath(record)}`);
  process.exitCode = 1;
}
