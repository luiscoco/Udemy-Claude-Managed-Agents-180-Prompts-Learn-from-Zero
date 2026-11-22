import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ResourceStore, settingsSchema } from './storage.js';
import { AgentWorkflow, safeError, resourceIds } from './workflow.js';
import { classroomClient } from './classroom.js';
import { z } from 'zod';

const root = new URL('../', import.meta.url);
const sources = ['src/resources.ts', 'src/storage.ts', 'src/client.ts', 'src/main.ts'];
const tasks = ['What is 2 + 2?', 'Explain the role of an agent, environment and session.'];
const store = new ResourceStore(process.env.LESSON_DATA_FILE || fileURLToPath(new URL('.runtime/demo-resource-ids.json', root)), 'demo');
await store.load();
const workflow = new AgentWorkflow(store, classroomClient(() => store.snapshot()));
async function readBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('Input too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { sources, tasks });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(200, store.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/resource-ids') {
      res.setHeader('Content-Disposition', 'attachment; filename="resource-ids.json"');
      return json(200, resourceIds(store.snapshot()));
    }
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const name = url.searchParams.get('name') || '';
      if (!sources.includes(name)) return json(404, { error: 'Unknown source file.' });
      return json(200, { name, language: 'typescript', text: await readFile(new URL(name, root), 'utf8') });
    }
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Use the local application.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send application/json.' });
      if (url.pathname === '/api/agent') return json(200, await workflow.agent(settingsSchema.parse(await readBody(req))));
      if (url.pathname === '/api/environment') return json(200, await workflow.environment());
      if (url.pathname === '/api/session') {
        const input = z.object({ task: z.enum(tasks as [string, ...string[]]) }).parse(await readBody(req));
        return json(200, await workflow.session(input.task));
      }
      if (url.pathname === '/api/observe') return json(200, await workflow.observe());
    }
    const assets: Record<string, [string, string]> = {
      '/': ['public/index.html', 'text/html'],
      '/app.js': ['public/app.js', 'text/javascript'],
      '/style.css': ['public/style.css', 'text/css'],
      '/agent.css': ['public/agent.css', 'text/css'],
      '/code-highlighting.css': ['public/code-highlighting.css', 'text/css'],
      '/astronaut.png': ['public/astronaut.png', 'image/png'],
      '/favicon.ico': ['public/favicon.svg', 'image/svg+xml'],
      '/vendor/prism.js': ['node_modules/prismjs/prism.js', 'text/javascript'],
      '/vendor/prism-typescript.js': ['node_modules/prismjs/components/prism-typescript.js', 'text/javascript'],
      '/vendor/prism-json.js': ['node_modules/prismjs/components/prism-json.js', 'text/javascript'],
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
    const failure = error instanceof z.ZodError
      ? { status: 400, error: 'Check the name, model, instructions and selected task.' }
      : safeError(error);
    json(failure.status, { error: failure.error });
  }
});
const port = Number(process.env.PORT || 4050);
server.listen(port, '127.0.0.1', () => console.log(`Prompt 5 working agent lab: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
