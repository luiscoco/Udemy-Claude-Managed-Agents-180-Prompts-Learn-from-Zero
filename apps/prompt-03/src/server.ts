import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { preflight } from './preflight.js';

const root = new URL('../', import.meta.url);
export const sources: Record<string, string> = {
  'src/config.ts': 'typescript', 'src/client.ts': 'typescript',
  'src/main.ts': 'typescript', 'package.json': 'json', 'tsconfig.json': 'json',
};
const classroomInput = z.object({
  keyPresent: z.boolean(), agentId: z.string().max(200), environmentId: z.string().max(200),
  missingSurface: z.boolean(),
});
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
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
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(200, { sources, runtime: preflight({}).runtime });
    }
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const name = url.searchParams.get('name') || '';
      if (!Object.hasOwn(sources, name)) return json(404, { error: 'Unknown source file.' });
      return json(200, { name, language: sources[name], text: await readFile(new URL(name, root), 'utf8') });
    }
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Use the local application.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send application/json.' });
      if (url.pathname === '/api/validate') {
        const input = classroomInput.parse(await readBody(req));
        return json(200, preflight({ ANTHROPIC_API_KEY: input.keyPresent ? 'classroom-placeholder-not-a-real-key' : '',
          AGENT_ID: input.agentId, ENVIRONMENT_ID: input.environmentId }, input.missingSurface));
      }
      if (url.pathname === '/api/server-check') {
        // Omit real identifiers and request plans from browser responses.
        const { requestPlan: _plan, ...report } = preflight(process.env);
        return json(200, { ...report, scope: 'Server environment; no credentials or resource values returned.' });
      }
    }
    const assets: Record<string, [string, string]> = {
      '/': ['public/index.html', 'text/html'],
      '/app.js': ['public/app.js', 'text/javascript'],
      '/style.css': ['public/style.css', 'text/css'],
      '/setup.css': ['public/setup.css', 'text/css'],
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
  } catch { json(400, { error: 'Unable to process this input. Check field types and lengths.' }); }
});
const port = Number(process.env.PORT || 4030);
server.listen(port, '127.0.0.1', () => console.log(`Prompt 3 setup lab: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
