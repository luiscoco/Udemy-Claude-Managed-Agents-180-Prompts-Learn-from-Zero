import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { SessionStore, createInput, messageInput, modeSchema, snippets, tasks, event } from './core.js';
import { ArchitectureLesson, LessonError, liveSetup } from './lesson.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const store = new SessionStore(process.env.LESSON_DATA_FILE
  ? resolve(process.env.LESSON_DATA_FILE)
  : fileURLToPath(new URL('../.runtime/sessions.json', import.meta.url)));
await store.load();
for (const session of store.all().filter(item => item.status === 'running')) {
  await store.change(session.id, current => ({ ...current!, status: session.mode === 'demo' ? 'idle' : 'attention',
    stopReason: null, events: [...current!.events, event('application.server_restarted', 'application', 'The server restarted during a turn. Inspect this session before continuing.')] }));
}
const lesson = new ArchitectureLesson(store);
const running = new Map<string, AbortController>();

async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32000) throw new LessonError('Request exceeds the lesson input limit.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new LessonError('Send a valid JSON request.'); }
}

function explain(error: unknown) {
  if (error instanceof LessonError) return { status: error.status, error: error.message };
  if (error instanceof Anthropic.APIError) return { status: 502,
    error: `Claude API returned ${error.status ?? 'a connection error'}. Check access and resource IDs. Request ${error.requestID ?? 'ID unavailable'}. Inspect Console before retrying an uncertain creation.` };
  if (error instanceof Error && error.name === 'ZodError') return { status: 400, error: 'Check the mode, resource references and task length of 5 to 4,000 characters.' };
  return { status: 500, error: 'The operation could not finish. Inspect the session state and server configuration before retrying.' };
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new LessonError('Use the local lesson application.', 403);
      if (!req.headers['content-type']?.startsWith('application/json')) throw new LessonError('Send application/json.', 415);
    }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { tasks, snippets, liveSetup: liveSetup() });
    if (req.method === 'GET' && url.pathname === '/api/resources') {
      return json(200, await lesson.resources(modeSchema.parse(url.searchParams.get('mode') || 'demo')));
    }
    if (req.method === 'GET' && url.pathname === '/api/sessions') return json(200, store.all());
    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const input = createInput.parse(await body(req));
      return json(201, await lesson.create(input.mode, input.agentId, input.environmentId));
    }
    const match = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(messages|inspect|stop))?$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (req.method === 'GET' && !match[2]) return json(200, lesson.get(id));
      if (req.method === 'POST' && match[2] === 'inspect') return json(200, await lesson.inspect(id));
      if (req.method === 'POST' && match[2] === 'stop') {
        lesson.get(id);
        running.get(id)?.abort();
        return json(202, { requested: true });
      }
      if (req.method === 'POST' && match[2] === 'messages') {
        const input = messageInput.parse(await body(req));
        lesson.get(id);
        if (lesson.active.has(id)) throw new LessonError('This session already has an active turn.', 409);
        const controller = new AbortController();
        running.set(id, controller);
        const deadline = setTimeout(() => controller.abort(), 180000);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        res.flushHeaders();
        const write = (value: unknown) => { if (!res.destroyed) res.write(JSON.stringify(value) + '\n'); };
        const heartbeat = setInterval(() => write({ kind: 'ping' }), 10000);
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          const session = await lesson.send(id, input.task, input.pace === 'fast', controller, session => write({ kind: 'snapshot', session }));
          write({ kind: 'complete', session });
        } catch (error) {
          write({ kind: 'error', error: controller.signal.aborted ? 'Turn stopped or reached its three-minute deadline. Inspect the retained session.' : explain(error).error });
        } finally {
          clearTimeout(deadline);
          clearInterval(heartbeat);
          running.delete(id);
          res.end();
        }
        return;
      }
    }
    const files: Record<string, [string, string]> = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
      '/style.css': ['style.css', 'text/css; charset=utf-8'],
      '/architecture.css': ['architecture.css', 'text/css; charset=utf-8'],
      '/code-highlighting.css': ['code-highlighting.css', 'text/css; charset=utf-8'],
      '/astronaut.png': ['astronaut.png', 'image/png'],
      '/favicon.ico': ['favicon.svg', 'image/svg+xml'],
      '/vendor/prism.js': ['../node_modules/prismjs/prism.js', 'text/javascript; charset=utf-8'],
      '/vendor/prism-typescript.js': ['../node_modules/prismjs/components/prism-typescript.js', 'text/javascript; charset=utf-8'],
      '/vendor/prism-json.js': ['../node_modules/prismjs/components/prism-json.js', 'text/javascript; charset=utf-8'],
    };
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, type] = files[url.pathname];
      const bytes = await readFile(publicDir + file);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(bytes);
    }
    json(404, { error: 'Route not found.' });
  } catch (error) {
    const result = explain(error);
    json(result.status, { error: result.error });
  }
});
const port = Number(process.env.PORT || 4020);
server.listen(port, '127.0.0.1', () => console.log(`Prompt 2 Architecture Lab running at http://127.0.0.1:${port}`));
function shutdown() {
  for (const controller of running.values()) controller.abort();
  server.close();
  setTimeout(() => process.exit(0), 7000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
