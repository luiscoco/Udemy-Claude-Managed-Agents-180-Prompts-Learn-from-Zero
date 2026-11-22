import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyState } from '../src/storage.js';

const directory = new URL('../.runtime/playwright/', import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL('resource-ids.json', directory);
await writeFile(file, JSON.stringify(emptyState('demo')));
process.env.LESSON_DATA_FILE = fileURLToPath(file);
process.env.PORT = '4050';
delete process.env.ANTHROPIC_API_KEY;
await import('../src/server.js');
