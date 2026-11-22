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
        case 'inspect':
            accept({ resources: r, files: Object.keys(s.files), fixtureOnly: true });
            break;
        case 'benchmark.run': {
            const count = Math.min(20, Math.max(1, Number(p.trials) || 3));
            s.rows = ['A', 'B'].flatMap((profile, i) => Array.from({ length: count }, (_, trial) => ({ profile: p[`setting${profile}`] || profile, trial: trial + 1, axis: p.axis, latencyMs: 120 + i * 40 + trial * 7, costCents: 2 + i + trial % 2, passed: i === 1 || trial % 3 !== 0, provenance: 'Synthetic fixture; not a model benchmark' })));
            accept({ trials: s.rows.length, provenance: 'Deterministic synthetic classroom measurements' });
            break;
        }
        case 'benchmark.score': {
            const profiles = [...new Set(s.rows.map(row => row.profile))];
            accept({ provenance: 'Synthetic fixture only', scores: profiles.map(profile => { const rows = s.rows.filter(row => row.profile === profile); return { profile, trials: rows.length, passRate: rows.filter(row => row.passed).length / rows.length, meanLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length, totalCostCents: rows.reduce((sum, row) => sum + row.costCents, 0) }; }) });
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
