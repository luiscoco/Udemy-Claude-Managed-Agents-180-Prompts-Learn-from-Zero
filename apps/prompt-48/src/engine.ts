import { createHash } from 'node:crypto';
import type { Action, Data, Lesson, State } from './types.js';
export const inventory = [{ sku: 'BK-01', quantity: 12, price: 25 }, { sku: 'PN-02', quantity: 30, price: 2 }, { sku: 'NT-03', quantity: 8, price: 10 }];
export const total = inventory.reduce((sum, row) => sum + row.quantity * row.price, 0);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
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
        case 'tools.bash':
            accept({ implementation: 'Fixed JavaScript data transform; arbitrary shell execution is not exposed.', ...report(s) });
            break;
        case 'file.read': {
            const path = p.path || '/inputs/report.txt';
            if (!(path in s.files))
                reject('Path does not exist in this lesson namespace.', { path });
            else
                accept({ path, content: s.files[path], sha256: hash(s.files[path]) });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
