import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { SessionStore, demoAnswer, event, resources, type LessonEvent, type LessonSession, type Mode } from './core.js';

export class LessonError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function liveSetup() {
  const needs = ['ANTHROPIC_API_KEY', 'MANAGED_AGENT_ID', 'MANAGED_ENVIRONMENT_ID'].filter(key => !process.env[key]);
  return { ready: needs.length === 0, needs };
}

function client() {
  if (!liveSetup().ready) throw new LessonError(`Configure ${liveSetup().needs.join(', ')} in .env and restart the app.`, 409);
  return new Anthropic({ maxRetries: 0, timeout: 30000,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' } });
}

// The lesson stores a projection of provider events, with local receipt times.
export function projectEvent(value: unknown): LessonEvent {
  const item = value as Record<string, unknown>;
  const blocks = Array.isArray(item.content) ? item.content : [];
  const text = blocks.flatMap((block: unknown) => {
    if (block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string') return [block.text];
    return [];
  }).join('\n');
  const reason = item.stop_reason;
  return {
    id: String(item.id), type: String(item.type), source: 'provider', time: new Date().toISOString(),
    ...(text ? { text } : {}),
    ...(reason && typeof reason === 'object' && 'type' in reason ? { stopReason: String(reason.type) } : {}),
  };
}

export class ArchitectureLesson {
  readonly active = new Set<string>();
  constructor(public store: SessionStore) {}

  async resources(mode: Mode) {
    if (mode === 'demo') return resources;
    const api = client();
    const [agent, environment] = await Promise.all([
      api.beta.agents.retrieve(process.env.MANAGED_AGENT_ID!),
      api.beta.environments.retrieve(process.env.MANAGED_ENVIRONMENT_ID!),
    ]);
    return {
      agents: [{ id: agent.id, name: agent.name, version: agent.version, model: agent.model,
        system: 'Existing server-configured agent. Its instructions and tools are managed in Console.' }],
      environments: [{ id: environment.id, name: environment.name, type: environment.config.type,
        description: 'Existing provider environment selected by the server configuration.' }],
    };
  }

  async create(mode: Mode, agentId: string, environmentId: string) {
    let id: string;
    let status = 'idle';
    if (mode === 'demo') {
      if (!resources.agents.some(agent => agent.id === agentId)) throw new LessonError('Agent reference was not found. Choose a configured agent.', 404);
      if (environmentId !== 'demo_env_cloud') throw new LessonError('Environment reference was not found. Session creation requires an accessible agent and environment.', 404);
      id = `demo_session_${randomUUID()}`;
    } else {
      if (agentId !== process.env.MANAGED_AGENT_ID || environmentId !== process.env.MANAGED_ENVIRONMENT_ID) {
        throw new LessonError('Use the server-configured resource references.', 403);
      }
      const session = await client().beta.sessions.create({ agent: agentId, environment_id: environmentId });
      id = session.id;
      status = session.status;
    }
    const created: LessonSession = {
      id, mode, agentId, environmentId, status, stopReason: null, createdAt: new Date().toISOString(),
      events: [event('application.session_created', 'application', mode === 'demo'
        ? 'Local demo session created. No provider resources were created.'
        : 'Hosted session created with the selected agent and environment references.')],
    };
    try { return await this.store.change(id, () => created); }
    catch (error) {
      if (mode === 'live') throw new LessonError(`Hosted session ${id} was created, but its local record could not be saved. Inspect it in Console before creating another session.`, 500);
      throw error;
    }
  }

  get(id: string) {
    const session = this.store.get(id);
    if (!session) throw new LessonError('This session is not registered in this local lesson.', 404);
    return session;
  }

  async append(id: string, item: LessonEvent) {
    return this.store.change(id, current => {
      if (!current) throw new LessonError('Session was not found.', 404);
      if (!current.events.some(previous => previous.id === item.id)) current.events.push(item);
      if (item.type === 'session.status_running') { current.status = 'running'; current.stopReason = null; }
      if (item.type === 'session.status_idle') { current.status = 'idle'; current.stopReason = item.stopReason ?? null; }
      return current;
    });
  }

  async send(id: string, task: string, fast: boolean, controller: AbortController, emit: (session: LessonSession) => void) {
    if (this.active.has(id)) throw new LessonError('This session already has an active turn.', 409);
    const initial = this.get(id);
    if (initial.status !== 'idle') throw new LessonError('Inspect this session and wait for an idle state before sending another task.', 409);
    this.active.add(id);
    const push = async (item: LessonEvent) => emit(await this.append(id, item));
    let finished = false;
    try {
      if (initial.mode === 'demo') {
        await push(event('user.message', 'demo', task));
        await push(event('session.status_running', 'demo'));
        await delay(fast ? 60 : 900, undefined, { signal: controller.signal });
        await push(event('agent.message', 'demo', demoAnswer(initial, task)));
        await delay(fast ? 60 : 500, undefined, { signal: controller.signal });
        await push(event('session.status_idle', 'demo', undefined, 'end_turn'));
        finished = true;
      } else {
        const api = client();
        const stream = await api.beta.sessions.events.stream(id, {}, { signal: controller.signal });
        try {
          await api.beta.sessions.events.send(id, { events: [{ type: 'user.message', content: [{ type: 'text', text: task }] }] }, { signal: controller.signal });
          await push(event('application.task_submitted', 'application', 'The task was sent after the event stream opened.'));
          let sawWork = false;
          for await (const value of stream) {
            const item = projectEvent(value);
            await push(item);
            if (item.type === 'session.status_running' || item.type === 'agent.message') sawWork = true;
            if (item.type === 'session.status_idle' && sawWork) { finished = true; break; }
            if (item.type === 'session.error') throw new LessonError(`Provider reported a session error. Inspect ${id} in Console.`, 502);
          }
          if (!finished) throw new LessonError('The stream ended before an idle event. Inspect the retained session.', 502);
        } finally { stream.controller.abort(); }
      }
    } finally {
      try {
        if (!finished) {
          if (initial.mode === 'demo') await push(event('session.status_idle', 'demo', 'The local turn was interrupted.', 'interrupted'));
          else {
            let status = 'attention';
            try {
              const api = client();
              const signal = AbortSignal.timeout(5000);
              await api.beta.sessions.events.send(id, { events: [{ type: 'user.interrupt' }] }, { signal });
              status = (await api.beta.sessions.retrieve(id, {}, { signal })).status;
            } catch { /* Retain the session for explicit inspection. */ }
            emit(await this.store.change(id, current => ({ ...current!, status, stopReason: null,
              events: [...current!.events, event('application.interrupt_requested', 'application', 'The turn ended early. Inspect the hosted session to confirm its state.')] })));
          }
        }
      } finally { this.active.delete(id); }
    }
    return this.get(id);
  }

  async inspect(id: string) {
    const current = this.get(id);
    if (this.active.has(id)) throw new LessonError('Wait for the active turn to finish before refreshing history.', 409);
    if (current.mode === 'demo') return current;
    this.active.add(id);
    try {
      const api = client();
      const session = await api.beta.sessions.retrieve(id);
      const history: LessonEvent[] = [];
      for await (const item of api.beta.sessions.events.list(id)) history.push(projectEvent(item));
      return await this.store.change(id, stored => ({ ...stored!, status: session.status,
        stopReason: history.findLast(item => item.type === 'session.status_idle')?.stopReason ?? null,
        events: [...stored!.events.filter(item => item.source === 'application'), ...history] }));
    } finally { this.active.delete(id); }
  }
}
