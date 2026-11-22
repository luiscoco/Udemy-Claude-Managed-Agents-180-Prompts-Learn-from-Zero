import type { Action, Data, Lesson, State } from './types.js';
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
const cents = (value: unknown) => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
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
        case 'budget.create':
            if (r.budgetRemoved)
                reject('A removed cap cannot be re-added to the existing session.');
            else if (!cents(p.amount))
                reject('Budget must be a positive whole USD-cent string without leading zeros.', { value: p.amount });
            else {
                r.budget = { cap: Number(p.amount), consumed: 0, paused: false };
                accept({ budget: r.budget, fixture: true });
            }
            break;
        case 'budget.exhaust':
            r.budget ??= { cap: 100, consumed: 0 };
            r.budget.consumed = r.budget.cap + 5;
            r.budget.paused = true;
            accept({ budget: r.budget, overshoot: 'An admitted in-flight fixture request completed across the cap.', provenance: 'Synthetic cost fixture' });
            break;
        case 'budget.increase':
            if (!cents(p.amount) || Number(p.amount) <= r.budget.consumed)
                reject('New cap must exceed consumed cost to resume.');
            else {
                r.budget.cap = Number(p.amount);
                r.budget.paused = false;
                accept({ budget: r.budget, resumed: true });
            }
            break;
        case 'budget.remove':
            delete r.budget;
            r.budgetRemoved = true;
            accept({ capRemoved: true, canReadd: false });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
