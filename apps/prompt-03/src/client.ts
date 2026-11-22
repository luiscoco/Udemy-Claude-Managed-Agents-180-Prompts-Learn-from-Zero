import Anthropic from '@anthropic-ai/sdk';
import { validateConfig, type Config } from './config.js';

export function createClient(config: Config, transport: Pick<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, 'fetch'> = {}) {
  return new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    maxRetries: 0,
    timeout: 30000,
    ...transport,
  });
}

export function hasSessions(client: unknown): boolean {
  const candidate = client as { beta?: { sessions?: { create?: unknown } } } | null;
  return typeof candidate?.beta?.sessions?.create === 'function';
}

// Validation and capability checks run before the network operation.
export async function createSession(input: unknown, factory = createClient) {
  const result = validateConfig(input);
  if (!result.ok) throw new Error(`Missing configuration: ${result.issues.map(i => i.field).join(', ')}`);
  const client = factory(result.config);
  if (!hasSessions(client)) throw new Error('Installed SDK lacks beta.sessions.create. Run npm ci.');
  return client.beta.sessions.create({
    agent: result.config.AGENT_ID,
    environment_id: result.config.ENVIRONMENT_ID,
  });
}
