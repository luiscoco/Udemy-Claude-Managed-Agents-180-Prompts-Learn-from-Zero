import type Anthropic from '@anthropic-ai/sdk';
import type { Settings } from './storage.js';

export async function createAgent(client: Anthropic, settings: Settings) {
  return client.beta.agents.create({
    name: settings.name,
    model: settings.model,
    system: settings.system,
  });
}

export async function createEnvironment(client: Anthropic) {
  return client.beta.environments.create({
    name: 'learning-env',
    config: { type: 'cloud' },
  });
}

export async function startSession(
  client: Anthropic, agentId: string, environmentId: string, task: string,
) {
  return client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    initial_events: [{
      type: 'user.message',
      content: [{ type: 'text', text: task }],
    }],
  });
}

export async function readHistory(
  client: Anthropic, sessionId: string, signal?: AbortSignal,
) {
  const events = [];
  // The SDK iterator follows every event-history page.
  for await (const event of client.beta.sessions.events.list(sessionId, {}, { signal })) {
    const text = 'content' in event && Array.isArray(event.content)
      ? event.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      : undefined;
    const stopReason = event.type === 'session.status_idle' ? event.stop_reason?.type : undefined;
    events.push({ id: event.id, type: event.type, text, stopReason });
  }
  const session = await client.beta.sessions.retrieve(sessionId, {}, { signal });
  return { events, status: session.status };
}
