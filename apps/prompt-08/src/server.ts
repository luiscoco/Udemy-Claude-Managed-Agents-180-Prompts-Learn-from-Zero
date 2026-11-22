import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { runPair } from './classroom.js';
import { inputSchema, defaults, API_VERSION, BETA, snippets } from './requests.js';
import { z } from 'zod';

const root = new URL('../', import.meta.url);
const sources = ['src/requests.ts', 'src/main.ts'];
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
    if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { sources, defaults, apiVersion: API_VERSION, beta: BETA });
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const name = url.searchParams.get('name') || '';
      if (!sources.includes(name)) return json(404, { error: 'Unknown source file.' });
      return json(200, { name, language: 'typescript', text: await readFile(new URL(name, root), 'utf8') });
    }
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Use the local application.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send application/json.' });
      if (url.pathname === '/api/preview') return json(200, snippets(inputSchema.parse(await readBody(req))));
      if (url.pathname === '/api/run') return json(200, await runPair(inputSchema.parse(await readBody(req))));
    }
    const assets: Record<string, [string, string]> = {
      '/': ['public/index.html', 'text/html'],
      '/app.js': ['public/app.js', 'text/javascript'],
      '/style.css': ['public/style.css', 'text/css'],
      '/headers.css': ['public/headers.css', 'text/css'],
      '/code-highlighting.css': ['public/code-highlighting.css', 'text/css'],
      '/astronaut.png': ['public/astronaut.png', 'image/png'],
      '/favicon.ico': ['public/favicon.svg', 'image/svg+xml'],
      '/vendor/prism.js': ['node_modules/prismjs/prism.js', 'text/javascript'],
      '/vendor/prism-typescript.js': ['node_modules/prismjs/components/prism-typescript.js', 'text/javascript'],
      '/vendor/prism-json.js': ['node_modules/prismjs/components/prism-json.js', 'text/javascript'],
      '/vendor/prism-http.js': ['node_modules/prismjs/components/prism-http.js', 'text/javascript'],
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
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json(400, { error: 'Choose supported header settings and send valid JSON.' });
    json(500, { error: 'The classroom request could not finish. Reload and try again.' });
  }
});
const port = Number(process.env.PORT || 4080);
server.listen(port, '127.0.0.1', () => console.log(`Prompt 8 API headers lab: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
