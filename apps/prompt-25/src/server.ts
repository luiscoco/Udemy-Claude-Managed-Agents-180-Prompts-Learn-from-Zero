import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessons, lessonByNumber } from './lessons.js';
import { executeLesson } from './engine.js';
import { initialState, type State, type Data } from './types.js';
const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4250);
const defaultLesson = 25;
const states: Record<string, Record<number, State>> = {};
await mkdir(resolve(base, '.runtime'), { recursive: true });
try {
    Object.assign(states, JSON.parse(await readFile(resolve(base, '.runtime/state.json'), 'utf8')));
}
catch { }
let queue = Promise.resolve();
async function save() {
    const text = JSON.stringify(states);
    const next = queue.then(async () => { await writeFile(resolve(base, '.runtime/state.tmp'), text); await rename(resolve(base, '.runtime/state.tmp'), resolve(base, '.runtime/state.json')); });
    queue = next.catch(() => { });
    await next;
}
const mime: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', json: 'application/json', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function send(res: ServerResponse, code: number, data: unknown) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req: IncomingMessage) { let text = ''; for await (const chunk of req) {
    text += chunk;
    if (text.length > 25000)
        throw new Error('Request too large');
} return JSON.parse(text || '{}') as Data; }
const locks = new Set<string>();
const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (url.pathname === '/') {
            res.writeHead(302, { Location: '/lesson/25' + url.search });
            res.end();
            return;
        }
        if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`) {
            send(res, 403, { error: 'Origin rejected' });
            return;
        }
        if (url.pathname === '/fixture/order') {
            send(res, 200, url.searchParams.has('malformed') ? { orderId: 100 } : { orderId: 'ORD-100', status: 'shipped' });
            return;
        }
        let owner = req.headers.cookie?.match(/(?:^|; )course_owner=([a-f0-9-]{36})(?:;|$)/)?.[1];
        if (!owner) {
            owner = randomUUID();
            res.setHeader('Set-Cookie', `course_owner=${owner}; HttpOnly; SameSite=Strict; Path=/`);
        }
        const owned = states[owner] ??= {};
        if (url.pathname === '/api/catalog') {
            send(res, 200, lessons.map(({ number, title, section }) => ({ number, title, section })));
            return;
        }
        const match = url.pathname.match(/^\/api\/lesson\/(\d+)(?:\/(action|reset|download))?$/);
        if (match) {
            const lesson = lessonByNumber(Number(match[1]));
            const number = lesson.number;
            const state = owned[number] ??= initialState(lesson);
            if (!match[2] && req.method === 'GET') {
                send(res, 200, { lesson, state });
                return;
            }
            if (match[2] === 'download' && req.method === 'GET') {
                const name = url.searchParams.get('name');
                const item = state.artifacts.find(item => item.name === name);
                if (!item) {
                    send(res, 404, { error: 'Artifact not found in this lesson' });
                    return;
                }
                const bytes = item.text !== undefined ? Buffer.from(item.text) : await readFile(resolve(base, item.path!.startsWith('fixtures/') ? 'data' : '.runtime', item.path!));
                res.writeHead(200, { 'Content-Type': mime[item.name.split('.').at(-1)!] || 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${item.name.replace(/[^\w.-]/g, '_')}"` });
                res.end(bytes);
                return;
            }
            if (req.method !== 'POST') {
                send(res, 405, { error: 'Method not allowed' });
                return;
            }
            const key = `${owner}:${number}`;
            if (locks.has(key)) {
                send(res, 409, { error: 'An operation is already in progress' });
                return;
            }
            locks.add(key);
            try {
                if (match[2] === 'reset') {
                    owned[number] = initialState(lesson);
                    await save();
                    send(res, 200, { state: owned[number] });
                    return;
                }
                const request = await body(req);
                const action = lesson.actions.find(item => item.id === request.action);
                if (!action) {
                    send(res, 400, { error: 'Unknown action' });
                    return;
                }
                if (request.revision !== state.revision) {
                    send(res, 409, { error: 'State changed; reload before retrying.' });
                    return;
                }
                const input: Data = {};
                for (const field of lesson.fields) {
                    const value = request.input?.[field.key] ?? field.value;
                    if (typeof value !== typeof field.value || (field.options && !field.options.includes(value)) || (typeof value === 'string' && value.length > 4000) || (typeof value === 'number' && !Number.isFinite(value))) {
                        send(res, 400, { error: `Invalid field: ${field.key}` });
                        return;
                    }
                    input[field.key] = value;
                }
                owned[number] = await executeLesson(lesson, state, action, input);
                await save();
                send(res, 200, { state: owned[number] });
                return;
            }
            finally {
                locks.delete(key);
            }
        }
        let path = url.pathname === '/' || /^\/lesson\/\d+$/.test(url.pathname) ? 'index.html' : url.pathname.slice(1);
        const allowed = ['index.html', 'app.js', 'style.css', 'course.css', 'code-highlighting.css', 'astronaut.png', 'favicon.svg'];
        let filename: string;
        if (allowed.includes(path))
            filename = resolve(base, 'public', path);
        else if (/^vendor\/prism(?:-(?:core|clike|javascript|typescript|json|yaml|markup|markdown|bash|powershell|http))?\.js$/.test(path)) {
            const name = path.slice(7);
            filename = resolve(base, 'public/vendor', name);
        }
        else {
            send(res, 404, { error: 'Not found' });
            return;
        }
        const bytes = await readFile(filename);
        res.writeHead(200, { 'Content-Type': `${mime[path.split('.').at(-1)!] || 'application/octet-stream'}; charset=utf-8` });
        res.end(bytes);
    }
    catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : 'Unexpected error' });
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Lesson 25: http://127.0.0.1:${port}/lesson/${defaultLesson} · ${lessons.length} runnable lessons`));
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(() => process.exit(0)));
