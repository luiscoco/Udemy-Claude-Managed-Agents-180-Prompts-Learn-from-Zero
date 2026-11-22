import type Anthropic from '@anthropic-ai/sdk';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';

export async function reproduceAgent(client: Anthropic, request: AgentCreateParams) {
  // Use the create-request configuration copied from Console.
  return client.beta.agents.create(request);
}

export async function testAgent(
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

export async function inspectSession(client: Anthropic, sessionId: string, signal?: AbortSignal) {
  const events = [];
  for await (const event of client.beta.sessions.events.list(sessionId, {}, { signal })) {
    const text = 'content' in event && Array.isArray(event.content)
      ? event.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      : undefined;
    events.push({ id: event.id, type: event.type, text,
      tool: 'name' in event ? event.name : undefined,
      stopReason: event.type === 'session.status_idle' ? event.stop_reason?.type : undefined });
  }
  const session = await client.beta.sessions.retrieve(sessionId, {}, { signal });
  return { status: session.status, events,
    stopReason: events.findLast(event => event.type === 'session.status_idle')?.stopReason ?? null };
}
