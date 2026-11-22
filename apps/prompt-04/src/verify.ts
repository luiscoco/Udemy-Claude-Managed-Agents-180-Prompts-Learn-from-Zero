import Anthropic from '@anthropic-ai/sdk';

export function safeFailure(error: unknown) {
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? null;
    const messages: Record<number, string> = {
      401: 'Authentication rejected. Check or replace the credential.',
      403: 'Access denied. Check workspace, resource permissions and beta access.',
      404: 'Resource not found or not visible. Check the ID and workspace.',
      429: 'Request rate limited. Wait before retrying.',
    };
    return { status, message: messages[status ?? 0] || 'Provider request failed. Check service status and access.' };
  }
  return { status: null, message: 'Unable to verify. Check local credentials, profile, network and configuration.' };
}

export async function verifyAgent(client: Anthropic, agentId: string) {
  if (!agentId.trim()) throw new Error('Set AGENT_ID before requesting an agent.');
  // Read-only verification; does not create an agent, environment or session.
  return client.beta.agents.retrieve(agentId.trim());
}
