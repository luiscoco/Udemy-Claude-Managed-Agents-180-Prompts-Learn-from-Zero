import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { analyzeLocally, buildTask, parseAnalysis, type Emit, type Product } from './core.js';

export function readiness() {
  const key = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = Boolean(process.env.CLAUDE_MODEL);
  return {
    managed: { ready: key && Boolean(process.env.MANAGED_AGENT_ID && process.env.MANAGED_ENVIRONMENT_ID),
      needs: ['ANTHROPIC_API_KEY', 'MANAGED_AGENT_ID', 'MANAGED_ENVIRONMENT_ID'].filter(k => !process.env[k]) },
    sdk: { ready: key && model, needs: ['ANTHROPIC_API_KEY', 'CLAUDE_MODEL'].filter(k => !process.env[k]) },
    messages: { ready: key && model, needs: ['ANTHROPIC_API_KEY', 'CLAUDE_MODEL'].filter(k => !process.env[k]) },
  };
}

const demoSteps: Record<Product, [string, string, string][]> = {
  managed: [
    ['Submit a session task', 'Your application', 'Pass the shared document to a configured agent and environment.'],
    ['Run the hosted agent loop', 'Anthropic service', 'The session service manages orchestration and conversation state.'],
    ['Receive session events', 'Your application', 'Read the response through events and retain the session reference.'],
  ],
  sdk: [
    ['Start query()', 'Your application', 'Launch the SDK runtime on the application host.'],
    ['Run the SDK agent loop', 'SDK in your process', 'The SDK controls turns and yields messages to the application.'],
    ['Read the result message', 'Your application', 'Consume the completed result and manage the process lifecycle.'],
  ],
  messages: [
    ['Build the messages array', 'Your application', 'Supply the task and document in a user message.'],
    ['Make one model request', 'Claude API', 'Generate a response from the supplied messages.'],
    ['Read response content', 'Your application', 'Your code owns any additional turns, history or tool execution.'],
  ],
};

export async function runDemo(product: Product, report: string, emit: Emit, signal: AbortSignal, fast: boolean) {
  for (const [name, owner, detail] of demoSteps[product]) {
    emit({ kind: 'step', name, owner, detail });
    await delay(fast ? 70 : 650, undefined, { signal });
  }
  const analysis = analyzeLocally(report);
  emit({ kind: 'step', name: 'Extract and verify passages', owner: 'Local demo engine',
    detail: 'Rule-based sentence extraction. All three demo paths use the same local analyzer.' });
  return analysis;
}

export async function runLive(product: Product, report: string, emit: Emit, controller: AbortController) {
  const status = readiness()[product];
  if (!status.ready) throw new Error(`Configure ${status.needs.join(', ')} on the server, then restart it.`);
  const task = buildTask(report);
  const signal = controller.signal;
  const client = new Anthropic({ maxRetries: 0, timeout: 60000,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' } });
  if (product === 'messages') {
    emit({ kind: 'step', name: 'Send messages.create', owner: 'Your application', detail: 'One model request containing the shared task and document.' });
    const response = await client.messages.create({ model: process.env.CLAUDE_MODEL!, max_tokens: 1800,
      messages: [{ role: 'user', content: task }] }, { signal });
    emit({ kind: 'step', name: 'Receive model response', owner: 'Claude API', detail: `Response stop reason ${response.stop_reason}.` });
    if (response.stop_reason !== 'end_turn') throw new Error(`Model stopped with ${response.stop_reason}. A complete report was not returned.`);
    const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
    return parseAnalysis(text, report);
  }
  if (product === 'sdk') {
    const cwd = await mkdtemp(join(tmpdir(), 'prompt-01-agent-'));
    try {
      emit({ kind: 'step', name: 'Launch query()', owner: 'Your application', detail: 'SDK subprocess, isolated working directory, text-only tool configuration and five-turn limit.' });
      for await (const message of query({ prompt: task, options: {
        model: process.env.CLAUDE_MODEL!, maxTurns: 5, tools: [], disallowedTools: ['*'],
        settingSources: [], persistSession: false, cwd, abortController: controller,
      } })) {
        if (message.type === 'system' && message.subtype === 'init') {
          emit({ kind: 'step', name: 'SDK runtime initialized', owner: 'SDK in your process', detail: 'The local runtime is running the query.' });
        }
        if (message.type === 'result') {
          if (message.subtype !== 'success') throw new Error(`Agent SDK ended with ${message.subtype}. Check the local runtime and its authentication.`);
          emit({ kind: 'step', name: 'Receive SDK result', owner: 'Your application', detail: 'The SDK yielded a successful result message.' });
          return parseAnalysis(message.result, report);
        }
      }
      throw new Error('The Agent SDK ended without a result.');
    } finally {
      const tempRoot = resolve(tmpdir()) + sep;
      if (!resolve(cwd).startsWith(tempRoot) || !cwd.startsWith(join(tmpdir(), 'prompt-01-agent-'))) {
        throw new Error('Unexpected SDK working directory. Cleanup stopped.');
      }
      await rm(cwd, { recursive: true, force: true });
    }
  }

  let sessionId: string | undefined;
  let finished = false;
  try {
    const session = await client.beta.sessions.create({ agent: process.env.MANAGED_AGENT_ID!,
      environment_id: process.env.MANAGED_ENVIRONMENT_ID! }, { signal });
    sessionId = session.id;
    emit({ kind: 'session', id: session.id });
    emit({ kind: 'step', name: 'Create hosted session', owner: 'Anthropic service', detail: `Session ${session.id} created. The application retains this ID.` });
    const stream = await client.beta.sessions.events.stream(session.id, {}, { signal });
    try {
      await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.message', content: [{ type: 'text', text: task }] }] }, { signal });
      emit({ kind: 'step', name: 'Submit user.message', owner: 'Your application', detail: 'Shared task sent after opening the session stream.' });
      let text = '';
      let sawWork = false;
      for await (const event of stream) {
        if (event.type === 'session.status_running') sawWork = true;
        if (event.type === 'agent.message') {
          sawWork = true;
          text = event.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
          emit({ kind: 'step', name: 'Receive agent.message', owner: 'Anthropic service', detail: 'A complete agent message arrived through the session stream.' });
        }
        if (event.type === 'session.status_idle' && sawWork) {
          finished = true;
          if (event.stop_reason?.type !== 'end_turn') throw new Error(`Session paused with ${event.stop_reason?.type ?? 'unknown reason'}. Inspect ${session.id} in Console.`);
          return parseAnalysis(text, report);
        }
      }
      throw new Error(`Session stream ended before completion. Inspect ${session.id} in Console.`);
    } finally {
      stream.controller.abort();
    }
  } finally {
    if (sessionId && !finished) {
      try {
        await client.beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }] }, { signal: AbortSignal.timeout(5000) });
        emit({ kind: 'step', name: 'Request session interrupt', owner: 'Your application', detail: `Completion was interrupted. Inspect retained session ${sessionId} before another run.` });
      } catch {
        emit({ kind: 'step', name: 'Session needs inspection', owner: 'Your application', detail: `Interrupt could not be confirmed. Inspect ${sessionId} in Console.` });
      }
    }
  }
}
