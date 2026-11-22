import type { Action, Data, Lesson, State } from './types.js';
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function ensureAgent(s: State) {
    return s.resources.agent ??= { id: 'demo_agent', name: 'Inventory analyst', version: 1, system: 'Cite approved sources.', tools: ['read'], versions: [{ version: 1, description: 'Initial configuration' }], archived: false };
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
        case 'environment.create':
            r.environment = { id: 'demo_environment', version: 1, allowlist: ['api.example.test'], archived: false };
            accept(r.environment);
            break;
        case 'environment.list':
            s.rows = r.environment ? [r.environment] : [];
            accept({ environments: s.rows });
            break;
        case 'environment.update':
            r.environment ??= { version: 1 };
            r.environment.version++;
            r.environment.allowlist = ['api.example.test', '*.docs.example.test'];
            accept(r.environment);
            break;
        case 'environment.archive':
            r.environment.archived = true;
            accept(r.environment);
            break;
        case 'session.create':
            if (ensureAgent(s).archived || r.environment?.archived)
                reject('Archived resources cannot start new sessions.');
            else
                accept({ session: session(s, p.initial ? { initialEvents: [{ role: 'user', content: 'Analyze inventory' }] } : {}) });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
