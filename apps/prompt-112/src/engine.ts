import { createHash } from 'node:crypto';
import type { Action, Data, Lesson, State } from './types.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function ensureMemory(s: State) {
    return s.resources.memory ??= { path: '/preferences/format.md', content: 'Use concise answers with source references.', history: [{ version: 1, content: 'Use concise answers with source references.', actor: 'alice' }], archived: false };
}
function memoryWrite(s: State, content: string, actor = 'alice') {
    const m = ensureMemory(s);
    m.content = content;
    m.history.push({ version: m.history.length + 1, content, actor });
    return { version: m.history.length, content_hash: hash(content), content };
}
export async function executeLesson(lesson: Lesson, original: State, action: Action, input: Data = {}): Promise<State> {
    const s = structuredClone(original);
    seedFiles(s);
    const p: Data = Object.fromEntries(lesson.fields.map(field => [field.key, field.value]));
    Object.assign(p, input, action.args);
    const r = s.resources;
    const op = action.op;
    s.revision++;
    s.status = 'completed';
    let result: Data = {};
    const reject = (reason: string, evidence: Data = {}) => { s.status = 'blocked'; result = { accepted: false, reason, ...evidence }; };
    const accept = (data: Data) => { result = { accepted: true, ...data }; };
    switch (op) {
        case 'memory.seed':
            accept({ memory: ensureMemory(s), content_hash: hash(ensureMemory(s).content) });
            break;
        case 'memory.write':
            if (p.access !== 'read_write')
                reject('Read-only memory cannot be written.');
            else
                accept(memoryWrite(s, 'Use concise answers with citations and verified totals.', p.actor));
            break;
        case 'memory.history':
            accept({ versions: ensureMemory(s).history, immutable: true });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
