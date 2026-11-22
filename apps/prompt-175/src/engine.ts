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
        case 'tool.retry': {
            const max = Math.min(5, Math.max(1, Number(p.maxAttempts) || 3));
            s.rows = [];
            for (let i = 1; i <= max; i++) {
                const success = !p.permanent && i === 3;
                s.rows.push({ attempt: i, result: success ? 'success' : p.permanent ? 'invalid_request' : 'transient_failure', delayMs: i === 1 ? 0 : 100 * 2 ** (i - 2), delaySimulated: true });
                if (success || p.permanent)
                    break;
            }
            const last = s.rows.at(-1)!;
            if (last.result !== 'success')
                reject('Retry loop ended without success.', { attempts: s.rows, bounded: true });
            else
                accept({ attempts: s.rows, bounded: true });
            break;
        }
        case 'tool.idempotent': {
            const id = String(p.eventId);
            const duplicate = s.seen.includes(id);
            if (!duplicate) {
                s.seen.push(id);
                r.writeCount = (r.writeCount || 0) + 1;
            }
            accept({ eventId: id, duplicate, writeCount: r.writeCount });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
