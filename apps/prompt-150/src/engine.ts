import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Action, Data, Lesson, State } from './types.js';
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
        case 'webhook.sign': {
            const id = 'delivery_fixture_1';
            const timestamp = Math.floor(Date.now() / 1000);
            const body = JSON.stringify({ type: 'session.status_idled', data: { id: 'demo_session' } });
            const signature = createHmac('sha256', 'synthetic-webhook-secret').update(`${id}.${timestamp}.${body}`).digest('hex');
            r.delivery = { id, timestamp, body, signature };
            accept({ delivery: r.delivery, algorithm: 'HMAC-SHA256 over id.timestamp.rawBody', key: 'Synthetic classroom key' });
            break;
        }
        case 'webhook.verify': {
            const d = r.delivery;
            if (!d) {
                reject('Create a signed delivery first.');
                break;
            }
            const body = p.tamper ? d.body + ' ' : d.body;
            const timestamp = p.stale ? d.timestamp - 600 : d.timestamp;
            const expected = createHmac('sha256', 'synthetic-webhook-secret').update(`${d.id}.${timestamp}.${body}`).digest();
            const supplied = Buffer.from(d.signature, 'hex');
            const fresh = Math.abs(Date.now() / 1000 - timestamp) <= 300;
            const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
            if (!fresh || !valid)
                reject('Delivery rejected before JSON processing.', { fresh, signatureValid: valid, syntheticProtocol: true });
            else
                accept({ fresh, signatureValid: valid, parsed: JSON.parse(body), syntheticProtocol: true });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
