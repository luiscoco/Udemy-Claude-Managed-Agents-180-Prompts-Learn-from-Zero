import { z } from 'zod';
import type { Action, Data, Lesson, State } from './types.js';
const orders = z.object({ orderId: z.string().regex(/^ORD-\d{3}$/) });
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
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
        case 'tool.request':
            r.toolRequest = { id: 'tool-call-1', name: 'get_order_status', input: { orderId: p.orderId } };
            accept(r.toolRequest);
            break;
        case 'tool.execute': {
            const parsed = orders.safeParse({ orderId: p.orderId || 'ORD-100' });
            if (!parsed.success)
                reject('Invalid order ID.');
            else {
                r.toolResult = { tool_use_id: r.toolRequest?.id || 'tool-call-1', orderId: parsed.data.orderId, status: parsed.data.orderId === 'ORD-100' ? 'shipped' : 'not_found' };
                accept(r.toolResult);
            }
            break;
        }
        case 'tool.result':
            accept({ event: { type: 'tool_result', ...r.toolResult }, correlated: r.toolRequest?.id === r.toolResult?.tool_use_id });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
