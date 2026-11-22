import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const hash = createHash('sha256');
for (const name of ['src/engine.ts', 'src/server.ts', 'src/lessons.ts', 'src/types.ts', 'public/app.js', 'public/index.html', 'public/course.css', 'public/style.css', 'public/code-highlighting.css', 'data/catalog.json', 'package-lock.json', 'tests/browser.spec.ts']) hash.update(readFileSync(new URL(`../${name}`, import.meta.url)));
export const buildId = hash.digest('hex');
