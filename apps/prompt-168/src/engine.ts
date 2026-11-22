import { createHash } from 'node:crypto';
import type { Action, Data, Lesson, State } from './types.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function ensureAgent(s: State) {
    return s.resources.agent ??= { id: 'demo_agent', name: 'Inventory analyst', version: 1, system: 'Cite approved sources.', tools: ['read'], versions: [{ version: 1, description: 'Initial configuration' }], archived: false };
}
function ensureMemory(s: State) {
    return s.resources.memory ??= { path: '/preferences/format.md', content: 'Use concise answers with source references.', history: [{ version: 1, content: 'Use concise answers with source references.', actor: 'alice' }], archived: false };
}
function session(s: State, extra: Data = {}) {
    const a = ensureAgent(s);
    const list = s.resources.sessions ??= [];
    const item = { id: `demo_session_${list.length + 1}`, status: 'idle', agent: a.id, agentVersion: a.version, snapshot: structuredClone(a), ...extra };
    list.push(item);
    s.resources.session = item;
    return item;
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
        case 'inspect':
            accept({ resources: r, files: Object.keys(s.files), fixtureOnly: true });
            break;
        case 'memory.read': {
            const m = ensureMemory(s);
            r.capturedHash = hash(m.content);
            accept({ session: p.session || 'main', path: m.path, content: m.content, content_hash: r.capturedHash, version: m.history.length });
            break;
        }
        case 'host.stage':
            r.staged = { files: ['/inputs/report.txt'], repositories: [{ commit: 'a'.repeat(40), path: '/repos/app' }], memorySync: 'Explicit local fixture adapter' };
            accept(r.staged);
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
