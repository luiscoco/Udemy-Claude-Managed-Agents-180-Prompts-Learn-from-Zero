import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { editorSchema, definitionFiles, editorFromFiles } from './definitions.js';
import { ClassroomStore } from './storage.js';
import { Reconciler, PlanError } from './reconciler.js';

const root = new URL('../', import.meta.url);
const store = new ClassroomStore(process.env.LESSON_DATA_FILE || fileURLToPath(new URL('.runtime/classroom.json', root)));
await store.load();
const lesson = new Reconciler(store);
const inputSchema = z.object({ editor: editorSchema, missingLock: z.boolean() });
const applySchema = inputSchema.extend({ token: z.string().length(64) });
const sources: Record<string, string> = {
  'src/reconciler.ts': 'typescript',
  'definitions/agents/reviewer.md': 'markdown',
  'definitions/environments/reviewer.yaml': 'yaml',
};
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16000) throw new PlanError('Lesson input exceeds the size limit.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PlanError('Send a valid JSON request.'); }
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const json = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(200, { editor: editorFromFiles(store.snapshot().files), sources });
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(200, store.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/lock') {
      res.setHeader('Content-Disposition', 'attachment; filename="classroom-claude-lock.json"');
      return json(200, store.snapshot().lock);
    }
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const name = url.searchParams.get('name') || '';
      if (!Object.hasOwn(sources, name)) return json(404, { error: 'Unknown source file.' });
      return json(200, { name, language: sources[name], text: await readFile(new URL(name, root), 'utf8') });
    }
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Use the local lesson application.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send application/json.' });
      if (url.pathname === '/api/preview') {
        const input = inputSchema.parse(await readBody(req));
        const files = definitionFiles(input.editor);
        return json(200, { files, plan: lesson.plan(files, input.missingLock) });
      }
      if (url.pathname === '/api/apply') {
        const input = applySchema.parse(await readBody(req));
        return json(200, await lesson.apply(definitionFiles(input.editor), input.missingLock, input.token));
      }
    }
    const assets: Record<string, [string, string]> = {
      '/': ['public/index.html', 'text/html'],
      '/app.js': ['public/app.js', 'text/javascript'],
      '/style.css': ['public/style.css', 'text/css'],
      '/declarative.css': ['public/declarative.css', 'text/css'],
      '/code-highlighting.css': ['public/code-highlighting.css', 'text/css'],
      '/astronaut.png': ['public/astronaut.png', 'image/png'],
      '/favicon.ico': ['public/favicon.svg', 'image/svg+xml'],
      '/vendor/prism.js': ['node_modules/prismjs/prism.js', 'text/javascript'],
      '/vendor/prism-typescript.js': ['node_modules/prismjs/components/prism-typescript.js', 'text/javascript'],
      '/vendor/prism-json.js': ['node_modules/prismjs/components/prism-json.js', 'text/javascript'],
      '/vendor/prism-yaml.js': ['node_modules/prismjs/components/prism-yaml.js', 'text/javascript'],
      '/vendor/prism-markdown.js': ['node_modules/prismjs/components/prism-markdown.js', 'text/javascript'],
      '/vendor/prism-powershell.js': ['node_modules/prismjs/components/prism-powershell.js', 'text/javascript'],
    };
    const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : undefined;
    if (req.method === 'GET' && asset) {
      const content = await readFile(new URL(asset[0], root));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      return res.end(content);
    }
    json(404, { error: 'Not found.' });
  } catch (error) {
    if (error instanceof PlanError) return json(error.status, { error: error.message });
    if (error instanceof z.ZodError) return json(400, { error: 'Check the definition fields and review a plan.' });
    json(500, { error: 'The operation could not finish. Reload to inspect the saved classroom state.' });
  }
});
const port = Number(process.env.PORT || 4070);
server.listen(port, '127.0.0.1', () => console.log(`Prompt 7 declarative lab: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
