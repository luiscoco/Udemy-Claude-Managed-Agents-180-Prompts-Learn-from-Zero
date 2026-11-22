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
        case 'schedule.create': {
            try {
                new Intl.DateTimeFormat('en', { timeZone: p.timezone || 'Europe/Madrid' });
            }
            catch {
                reject('Invalid IANA timezone.');
                break;
            }
            if (!/^0 9 \* \* (1-5|1,2,3,4,5)$/.test(p.cron || '0 9 * * 1-5')) {
                reject('This classroom scheduler supports weekday 09:00 only.');
                break;
            }
            const timezone = p.timezone || 'Europe/Madrid';
            r.schedule = { cron: p.cron || '0 9 * * 1,2,3,4,5', timezone, next: ['2026-11-16T08:00:00Z', '2026-11-17T08:00:00Z', '2026-11-18T08:00:00Z'].map(utc => ({ utc, local: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(utc)) })), calculation: 'Fixed November 2026 fixture dates; no scheduler running' };
            accept(r.schedule);
            break;
        }
        case 'schedule.inspect':
            accept({ schedule: r.schedule, localTimesIncludeTimezone: true, automaticTriggersActive: false });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
