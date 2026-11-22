import type { Action, Data, Lesson, State } from './types.js';
export const inventory = [{ sku: 'BK-01', quantity: 12, price: 25 }, { sku: 'PN-02', quantity: 30, price: 2 }, { sku: 'NT-03', quantity: 8, price: 10 }];
export const total = inventory.reduce((sum, row) => sum + row.quantity * row.price, 0);
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function approval(s: State, threads = false) {
    s.resources.pending = (threads ? ['A', 'B'] : ['main']).map((thread, i) => ({ eventId: `permission_${i + 1}`, thread, tool: 'write_report', status: 'pending' }));
    return s.resources.pending;
}
function report(s: State) {
    seedFiles(s);
    const rows = inventory.map(row => ({ ...row, value: row.quantity * row.price }));
    s.files['/outputs/summary.json'] = JSON.stringify({ rows, total, currency: 'USD', source: '/inputs/inventory.csv' }, null, 2);
    s.files['/outputs/summary.csv'] = 'sku,value\n' + rows.map(row => `${row.sku},${row.value}`).join('\n') + `\nTOTAL,${total}\n`;
    s.rows = rows;
    return { total, currency: 'USD', source: '/inputs/inventory.csv', calculation: '12 × 25 + 30 × 2 + 8 × 10 = 440' };
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
        case 'workflow.complete':
            r.workflow ??= { id: 'demo_workflow', phases: [{ name: 'research' }, { name: 'verify' }] };
            r.workflow.status = 'completed';
            r.workflow.phases.forEach((phase: Data) => phase.status = 'completed');
            accept({ workflow: r.workflow, ...report(s), verified: total === 440 });
            break;
        case 'project.reporting':
            r.reporting = { cron: '0 9 * * 1,2,3,4,5', timezone: 'Europe/Madrid', runId: 'run_2026_11_16', period: '2026-W47', reviewed: true, delivery: 'Local outbox only' };
            approval(s);
            accept({ reporting: r.reporting, specialists: ['research', 'verify', 'format'], externalDeliveryEnabled: false });
            break;
        case 'project.deliver': {
            const key = `${r.reporting?.runId}:${r.reporting?.period}`;
            if (!r.reporting || r.workflow?.status !== 'completed') {
                reject('Complete the reviewed reporting workflow first.');
                break;
            }
            const duplicate = s.seen.includes(key);
            if (!duplicate) {
                s.seen.push(key);
                r.outbox ??= [];
                r.outbox.push({ key, total, destination: 'Local classroom outbox' });
            }
            accept({ deduplicationKey: key, duplicate, outbox: r.outbox, externalMessageSent: false });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
