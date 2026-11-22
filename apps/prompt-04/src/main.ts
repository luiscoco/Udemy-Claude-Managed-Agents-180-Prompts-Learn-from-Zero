import { apiKeyClient } from './api-client.js';
import { cliLoginClient } from './cli-client.js';
import { safeFailure, verifyAgent } from './verify.js';

const mode = process.argv.includes('--cli') ? 'cli-login' : 'api-key';
if (!process.env.AGENT_ID?.trim()) {
  console.error('Set AGENT_ID in your server environment or .env. No request sent.');
  process.exitCode = 1;
} else if (mode === 'api-key' && !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('Set ANTHROPIC_API_KEY on the server. No request sent.');
  process.exitCode = 1;
} else {
  try {
    const client = mode === 'api-key' ? apiKeyClient() : cliLoginClient();
    const agent = await verifyAgent(client, process.env.AGENT_ID);
    console.log(JSON.stringify({ mode, verified: true, agentId: agent.id }, null, 2));
  } catch (error) {
    // Never print raw errors, headers, provider bodies or credential files.
    console.error(JSON.stringify({ mode, verified: false, ...safeFailure(error) }, null, 2));
    process.exitCode = 1;
  }
}
