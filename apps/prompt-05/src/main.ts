import { fileURLToPath } from 'node:url';
import { mkdir, open, unlink, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { liveClient } from './client.js';
import { ResourceStore } from './storage.js';
import { AgentWorkflow, resourceIds, safeError, WorkflowError } from './workflow.js';

const file = fileURLToPath(new URL('../.runtime/live-resource-ids.json', import.meta.url));
let lock: FileHandle | undefined;
try {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new WorkflowError('Set ANTHROPIC_API_KEY in .env.');
  await mkdir(dirname(file), { recursive: true });
  try { lock = await open(file + '.lock', 'wx'); }
  catch { throw new WorkflowError('Check the live workflow lock. Another runner may be active.', 409); }
  const store = new ResourceStore(file, 'live');
  await store.load();
  const model = store.snapshot().settings?.model || process.env.MODEL_ID?.trim();
  if (!model) throw new WorkflowError('Set MODEL_ID to an available Managed Agents model.');
  const workflow = new AgentWorkflow(store, liveClient());
  await workflow.agent({ name: process.env.AGENT_NAME || 'Learning agent', model,
    system: process.env.AGENT_SYSTEM || 'Explain your results clearly.' });
  await workflow.environment();
  await workflow.session(process.env.AGENT_TASK || 'What is 2 + 2?');
  console.log(JSON.stringify(resourceIds(store.snapshot()), null, 2));
  const signal = AbortSignal.timeout(180000);
  let state;
  do {
    state = await workflow.observe(signal);
    console.log(`Session state ${state.status}. Stop reason ${state.stopReason ?? 'pending'}.`);
    if (state.status !== 'running' && state.status !== 'accepted') break;
    await delay(2000, undefined, { signal });
  } while (!signal.aborted);
  for (const event of state.events.filter(event => event.type === 'agent.message')) console.log(event.text);
  const hasReply = state.events.some(event => event.type === 'agent.message' && event.text);
  if (state.status !== 'idle' || state.stopReason !== 'end_turn' || !hasReply) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify(safeError(error), null, 2));
  console.error(`Workflow resource file ${file}.`);
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await unlink(file + '.lock');
  }
}
