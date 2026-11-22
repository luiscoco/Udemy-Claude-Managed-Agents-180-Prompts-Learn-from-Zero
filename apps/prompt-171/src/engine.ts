import { z } from 'zod';
import type { Action, Data, Lesson, State } from './types.js';
const answerSchema = z.object({ summary: z.string().min(1), sources: z.array(z.string()).min(1) }).strict();
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
        case 'json.validate':
        case 'json.correct': {
            r.jsonAttempts = (r.jsonAttempts || 0) + 1;
            if (r.jsonAttempts > 3) {
                reject('Three-attempt validation bound reached.');
                break;
            }
            let candidate: unknown;
            try {
                candidate = JSON.parse(op === 'json.correct' ? '{"summary":"Inventory value is USD 440.","sources":["/inputs/report.txt"]}' : String(p.candidate));
            }
            catch {
                reject('Candidate is not valid JSON.', { attempt: r.jsonAttempts });
                break;
            }
            const parsed = answerSchema.safeParse(candidate);
            if (!parsed.success)
                reject('Candidate failed the Zod schema.', { issues: parsed.error.issues, attempt: r.jsonAttempts });
            else
                accept({ validated: parsed.data, attempt: r.jsonAttempts, modelInvoked: false });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
