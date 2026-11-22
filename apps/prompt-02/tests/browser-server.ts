import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Reset only the dedicated browser-test fixture before the server loads it.
const file = resolve('.runtime/playwright/sessions.json');
await mkdir(dirname(file), { recursive: true });
await writeFile(file, '[]');
process.env.LESSON_DATA_FILE = file;
process.env.PORT = '4020';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.MANAGED_AGENT_ID;
delete process.env.MANAGED_ENVIRONMENT_ID;
await import('../src/server.js');
