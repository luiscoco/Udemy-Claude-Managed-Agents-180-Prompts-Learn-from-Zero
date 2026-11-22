import Anthropic from '@anthropic-ai/sdk';

export function liveClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY in your server environment.');
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey,
    baseURL: 'https://api.anthropic.com',
    defaultHeaders: {
      'anthropic-beta': 'managed-agents-2026-04-01',
      ...(workspace ? { 'anthropic-workspace-id': workspace } : {}),
    },
    maxRetries: 0,
    timeout: 30000,
  });
}
