import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ResourceStore, settingsSchema, type Settings, type State } from './storage.js';
import { createAgent, createEnvironment, startSession, readHistory } from './resources.js';

export class WorkflowError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export const taskSchema = z.string().trim().min(1).max(4000);

export class AgentWorkflow {
  private busy = false;
  constructor(readonly store: ResourceStore, private client: Anthropic) {}

  private async exclusive(operation: () => Promise<State>) {
    if (this.busy) throw new WorkflowError('Wait for the current operation to finish.', 409);
    this.busy = true;
    try { return await operation(); }
    finally { this.busy = false; }
  }

  private async create(
    step: 'agent' | 'environment' | 'session',
    operation: () => Promise<{ id: string }>,
    update: Partial<State>,
  ) {
    const state = this.store.snapshot();
    if (state.pending) throw new WorkflowError('A previous creation needs inspection. Recover its ID in the saved resource file before continuing.', 409);
    // Persist intent before requesting a remote resource.
    await this.store.save({ ...state, ...update, pending: step });
    let resource;
    try { resource = await operation(); }
    catch (error) {
      // These API rejections identify an unsuccessful creation.
      if (error instanceof Anthropic.APIError && [400, 401, 403, 404, 422, 429].includes(error.status)) {
        await this.store.save({ ...this.store.snapshot(), pending: null });
      }
      throw error;
    }
    const field = step === 'agent' ? 'agentId' : step === 'environment' ? 'environmentId' : 'sessionId';
    try {
      return await this.store.save({ ...this.store.snapshot(), [field]: resource.id, pending: null });
    } catch {
      throw new WorkflowError(`Created ${step} ${resource.id}. Save that ID in the resource file before retrying.`, 500);
    }
  }

  agent(input: Settings) {
    return this.exclusive(async () => {
      const state = this.store.snapshot();
      if (state.agentId) return state;
      const settings = settingsSchema.parse(input);
      return this.create('agent', () => createAgent(this.client, settings), { settings });
    });
  }

  environment() {
    return this.exclusive(async () => {
      const state = this.store.snapshot();
      if (!state.agentId) throw new WorkflowError('Create the agent first.', 409);
      if (state.environmentId) return state;
      return this.create('environment', () => createEnvironment(this.client), {});
    });
  }

  session(input: string) {
    return this.exclusive(async () => {
      const state = this.store.snapshot();
      if (!state.agentId || !state.environmentId) throw new WorkflowError('Create the agent and environment first.', 409);
      if (state.sessionId) return state;
      const task = taskSchema.parse(input);
      return this.create('session', () => startSession(this.client, state.agentId!, state.environmentId!, task),
        { task, status: 'accepted', stopReason: null });
    });
  }

  observe(signal?: AbortSignal) {
    return this.exclusive(async () => {
      const state = this.store.snapshot();
      if (!state.sessionId) throw new WorkflowError('Start a session first.', 409);
      await this.store.save({ ...state, polls: state.polls + 1 });
      const history = await readHistory(this.client, state.sessionId, signal);
      const idle = history.events.findLast(event => event.type === 'session.status_idle');
      return this.store.save({ ...this.store.snapshot(), events: history.events,
        status: history.status, stopReason: idle?.stopReason ?? null });
    });
  }
}

export function resourceIds(state: State) {
  return { mode: state.mode, agentId: state.agentId, environmentId: state.environmentId, sessionId: state.sessionId };
}

export function safeError(error: unknown) {
  if (error instanceof WorkflowError) return { status: error.status, error: error.message };
  if (error instanceof Anthropic.APIError) {
    return { status: 502, error: `API request failed (HTTP ${error.status ?? 'connection error'}). Check model availability, credentials and resource access. Inspect any pending creation before retrying.` };
  }
  return { status: 400, error: 'Check configuration and saved resource state. Inspect any pending creation before retrying.' };
}
