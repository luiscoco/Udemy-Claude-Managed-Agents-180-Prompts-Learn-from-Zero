import Anthropic from '@anthropic-ai/sdk';

// In your terminal: ant auth login --profile lesson
// Inspect the active credential source: ant auth status --profile lesson
export function cliLoginClient(env = process.env, transport: Pick<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, 'fetch'> = {}) {
  return new Anthropic({
    // Explicit profile selects locally stored credentials in this pinned SDK.
    // It overrides environment API-key / auth-token credentials for this client.
    profile: env.ANTHROPIC_PROFILE?.trim() || 'lesson',
    baseURL: 'https://api.anthropic.com',
    defaultHeaders: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    maxRetries: 0,
    timeout: 15000,
    ...transport,
  });
}
