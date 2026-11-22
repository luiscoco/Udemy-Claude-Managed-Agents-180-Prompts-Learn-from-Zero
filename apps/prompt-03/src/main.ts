import Anthropic from '@anthropic-ai/sdk';
import { createSession } from './client.js';
import { preflight } from './preflight.js';

const report = preflight(process.env);
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;
else if (process.argv.includes('--create-session')) {
  try {
    const session = await createSession(process.env);
    console.log(JSON.stringify({ id: session.id, note: 'Session created. Send a user event to start a task.' }, null, 2));
  } catch (error) {
    // Do not log provider bodies or request headers containing credentials.
    console.error(error instanceof Anthropic.APIError
      ? `Session creation failed (HTTP ${error.status ?? 'connection error'}). Inspect Console before retrying.`
      : 'Session creation failed. Check configuration and SDK installation.');
    process.exitCode = 1;
  }
}
