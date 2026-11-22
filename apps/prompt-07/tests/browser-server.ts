import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyState } from '../src/storage.js';

const directory = new URL('../.runtime/playwright/', import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL('classroom.json', directory);
await writeFile(file, JSON.stringify(emptyState()));
process.env.LESSON_DATA_FILE = fileURLToPath(file);
process.env.PORT = '4070';
await import('../src/server.js');
