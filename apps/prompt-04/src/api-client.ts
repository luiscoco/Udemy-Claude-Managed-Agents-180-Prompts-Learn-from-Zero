import Anthropic from '@anthropic-ai/sdk';

export function apiKeyClient(env = process.env, transport: Pick<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, 'fetch'> = {}) {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY on the server.');
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey,
    baseURL: 'https://api.anthropic.com',
    defaultHeaders: {
      'anthropic-beta': 'managed-agents-2026-04-01',
      ...(workspace ? { 'anthropic-workspace-id': workspace } : {}),
    },
    maxRetries: 0,
    timeout: 15000,
    ...transport,
  });
}
