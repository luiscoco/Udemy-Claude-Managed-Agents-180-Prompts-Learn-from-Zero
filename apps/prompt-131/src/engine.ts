import type { Action, Data, Lesson, State } from './types.js';
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function approval(s: State, threads = false) {
    s.resources.pending = (threads ? ['A', 'B'] : ['main']).map((thread, i) => ({ eventId: `permission_${i + 1}`, thread, tool: 'write_report', status: 'pending' }));
    return s.resources.pending;
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
        case 'approval.threads':
            accept({ requests: approval(s, true) });
            break;
        case 'approval.respond': {
            const pending = (r.pending || []).find((item: Data) => item.status === 'pending');
            if (!pending)
                reject('No pending request. Receive a request first.');
            else if (pending.serverDenied && p.decision === 'allow') {
                pending.status = 'denied';
                reject('Client approval cannot override a server denial.', { request: pending });
            }
            else {
                pending.status = p.decision === 'allow' ? 'allowed' : 'denied';
                accept({ request: pending, remaining: r.pending.filter((item: Data) => item.status === 'pending').length });
            }
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
