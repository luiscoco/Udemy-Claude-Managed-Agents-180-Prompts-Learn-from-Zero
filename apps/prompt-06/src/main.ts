import Anthropic from '@anthropic-ai/sdk';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile, rename, unlink, type FileHandle } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { liveClient } from './client.js';
import { reproduceAgent, testAgent, inspectSession } from './reproduce.js';

const identifier = z.string().trim().min(1).refine(value => !value.startsWith('<') && !value.startsWith('demo_'));
const profileSchema = z.object({
  consoleAgentId: identifier,
  environmentId: identifier,
  agent: z.object({ name: z.string().min(1), model: z.union([
    identifier, z.object({ id: identifier }).passthrough(),
  ]) }).passthrough(),
  task: z.string().trim().min(1).max(4000),
});
const recordSchema = z.object({ fingerprint: z.string(), agentId: z.string().nullable(),
  sessionId: z.string().nullable(), pending: z.enum(['agentId', 'sessionId']).nullable() });
type RecordState = z.infer<typeof recordSchema>;
const reuse = process.argv.includes('--reuse');
const file = fileURLToPath(new URL(`../.runtime/${reuse ? 'reuse' : 'reproduce'}-ids.json`, import.meta.url));
let lock: FileHandle | undefined;

async function save(record: RecordState) {
  await writeFile(file + '.tmp', JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(file + '.tmp', file);
}

async function createAndSave(
  record: RecordState, field: 'agentId' | 'sessionId', operation: () => Promise<{ id: string }>,
) {
  record.pending = field;
  await save(record);
  let created;
  try { created = await operation(); }
  catch (error) {
    if (error instanceof Anthropic.APIError && [400, 401, 403, 404, 422, 429].includes(error.status)) {
      record.pending = null;
      await save(record);
    }
    throw error;
  }
  // IDs are safe to print for recovery if the following disk commit fails.
  console.log(JSON.stringify({ [field]: created.id }));
  record[field] = created.id;
  record.pending = null;
  await save(record);
}

try {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('Set ANTHROPIC_API_KEY.');
  const profile = profileSchema.parse(JSON.parse(await readFile(new URL('../console-profile.json', import.meta.url), 'utf8')));
  const fingerprint = createHash('sha256').update(JSON.stringify({ reuse, profile })).digest('hex');
  await mkdir(dirname(file), { recursive: true });
  lock = await open(file + '.lock', 'wx');
  let record: RecordState = { fingerprint, agentId: reuse ? profile.consoleAgentId : null, sessionId: null, pending: null };
  try { record = recordSchema.parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (record.fingerprint !== fingerprint || record.pending) throw new Error('Inspect saved creation state before continuing.');
  const client = liveClient();
  await client.beta.environments.retrieve(profile.environmentId);
  if (reuse) await client.beta.agents.retrieve(profile.consoleAgentId);
  if (!record.agentId) await createAndSave(record, 'agentId', () => reproduceAgent(client, profile.agent as AgentCreateParams));
  if (!record.sessionId) await createAndSave(record, 'sessionId', () => testAgent(client, record.agentId!, profile.environmentId, profile.task));
  console.log(JSON.stringify({ agentId: record.agentId, environmentId: profile.environmentId, sessionId: record.sessionId }, null, 2));
  const signal = AbortSignal.timeout(180000);
  let observation;
  do {
    observation = await inspectSession(client, record.sessionId!, signal);
    if (observation.status !== 'running') break;
    await delay(2000, undefined, { signal });
  } while (!signal.aborted);
  for (const event of observation.events) {
    if (event.type === 'agent.message') console.log(event.text);
    if (event.tool) console.log(`Observed tool ${event.tool}`);
  }
  console.log(JSON.stringify({ status: observation.status, stopReason: observation.stopReason }));
  const hasReply = observation.events.some(event => event.type === 'agent.message' && event.text);
  if (observation.status !== 'idle' || observation.stopReason !== 'end_turn' || !hasReply) process.exitCode = 1;
} catch (error) {
  const status = error instanceof Anthropic.APIError ? error.status : null;
  console.error(JSON.stringify({ status,
    error: 'Check .env, console-profile.json, account access and the saved creation record. Recover pending IDs before retrying.' }));
  console.error(`Creation record ${file}`);
  process.exitCode = 1;
} finally {
  if (lock) { await lock.close(); await unlink(file + '.lock'); }
}
