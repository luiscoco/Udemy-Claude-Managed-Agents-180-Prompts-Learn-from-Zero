import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import Anthropic from '@anthropic-ai/sdk';
import { products, sampleReport, snippets, runInput, type RunEvent } from './core.js';
import { readiness, runDemo, runLive } from './adapters.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 4010);
const active = new Set<AbortController>();
async function readBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const path = req.url?.split('?')[0];
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && path === '/api/config') {
    return json(200, { products, sampleReport, snippets, readiness: readiness() });
  }
  if (req.method === 'POST' && path === '/api/run') {
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Use the local application to start a run.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send application/json.' });
    let input;
    try {
      input = runInput.parse(await readBody(req));
    } catch {
      return json(400, { error: 'Choose a product and mode, and supply a document between 40 and 30,000 characters.' });
    }
    if (active.size >= 3) return json(429, { error: 'Three runs are already active. Wait for one to finish.' });
    if (input.mode === 'live' && !readiness()[input.product].ready) {
      return json(409, { error: `Configure ${readiness()[input.product].needs.join(', ')} on the server and restart it.` });
    }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const controller = new AbortController();
    active.add(controller);
    const timeout = setTimeout(() => controller.abort(), 180000);
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write('{"kind":"ping"}\n'); }, 10000);
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const emit = (event: RunEvent) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
    const start = performance.now();
    try {
      const analysis = input.mode === 'demo'
        ? await runDemo(input.product, input.report, emit, controller.signal, input.pace === 'fast')
        : await runLive(input.product, input.report, emit, controller);
      emit({ kind: 'result', analysis, mode: input.mode, durationMs: Math.round(performance.now() - start) });
    } catch (error) {
      let message = 'The run failed. Check the server configuration and try again.';
      if (controller.signal.aborted) message = 'Run stopped or exceeded the three-minute deadline. Inspect any retained hosted session before starting another run.';
      else if (error instanceof Anthropic.APIError) message = `Claude API returned ${error.status ?? 'a transport error'}. Check credentials, model access and resource configuration. Request ${error.requestID ?? 'ID unavailable'}.`;
      else if (error instanceof Error) {
        message = error.name === 'ZodError' || error instanceof SyntaxError
          ? 'The response did not match the analysis schema. Retry the run or inspect the configured agent.'
          : error.message;
        const key = process.env.ANTHROPIC_API_KEY;
        if (key) message = message.replaceAll(key, '[redacted]');
      }
      emit({ kind: 'error', message });
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      active.delete(controller);
      res.end();
    }
    return;
  }
  const files: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/code-highlighting.css': ['code-highlighting.css', 'text/css; charset=utf-8'],
    '/vendor/prism.js': ['../node_modules/prismjs/prism.js', 'text/javascript; charset=utf-8'],
    '/vendor/prism-typescript.js': ['../node_modules/prismjs/components/prism-typescript.js', 'text/javascript; charset=utf-8'],
    '/astronaut.png': ['astronaut.png', 'image/png'],
    '/favicon.ico': ['favicon.svg', 'image/svg+xml'],
  };
  if (req.method === 'GET' && path && files[path]) {
    try {
      const [file, type] = files[path];
      res.writeHead(200, { 'Content-Type': type });
      res.end(await readFile(publicDir + file));
    } catch { if (!res.headersSent) res.writeHead(500); res.end('Unable to load application asset.'); }
    return;
  }
  json(404, { error: 'Route not found.' });
});

server.listen(port, '127.0.0.1', () => console.log(`Prompt 1 Product Lab running at http://127.0.0.1:${port}`));
function shutdown() {
  for (const controller of active) controller.abort();
  server.close();
  setTimeout(() => process.exit(0), 7000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
