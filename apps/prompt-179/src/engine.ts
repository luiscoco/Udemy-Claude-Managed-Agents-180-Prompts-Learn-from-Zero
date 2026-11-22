import type { Action, Data, Lesson, State } from './types.js';
export const inventory = [{ sku: 'BK-01', quantity: 12, price: 25 }, { sku: 'PN-02', quantity: 30, price: 2 }, { sku: 'NT-03', quantity: 8, price: 10 }];
export const total = inventory.reduce((sum, row) => sum + row.quantity * row.price, 0);
function seedFiles(s: State) {
    s.files['/inputs/report.txt'] ??= 'Approved inventory report\nBK-01: 12 units at USD 25 = USD 300\nPN-02: 30 units at USD 2 = USD 60\nNT-03: 8 units at USD 10 = USD 80\nTotal inventory valuation: USD 440.\n';
    s.files['/inputs/inventory.csv'] ??= 'sku,quantity,unit_price\nBK-01,12,25\nPN-02,30,2\nNT-03,8,10\n';
    s.files['/repo/auth.ts'] ??= 'export function authorize(owner: string, actor: string) { return owner === actor; }';
}
function ensureMemory(s: State) {
    return s.resources.memory ??= { path: '/preferences/format.md', content: 'Use concise answers with source references.', history: [{ version: 1, content: 'Use concise answers with source references.', actor: 'alice' }], archived: false };
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
        case 'retrieval.answer': {
            const retrieved = r.retrieved || [{ source: '/inputs/report.txt', text: s.files['/inputs/report.txt'] }];
            accept({ answer: `Inventory value is USD ${total}.`, citations: retrieved.map((row: Data) => ({ source: row.source, quote: row.text.split('\n').find((line: string) => line.includes('440')) || row.text.split('\n')[0] })), sourceVerified: true, modelInvoked: false });
            break;
        }
        case 'artifact.generate': {
            const format = p.format || r.skill?.format || 'pdf';
            s.artifacts = s.artifacts.filter(item => item.name !== `inventory-report.${format}`);
            s.artifacts.push({ name: `inventory-report.${format}`, path: `fixtures/inventory-report.${format}` });
            accept({ format, sourceTotal: total, prebuiltClassroomFixture: true, providerSkillInvoked: false });
            break;
        }
        case 'project.research':
            ensureMemory(s);
            r.retrieved = [{ source: '/inputs/report.txt', text: s.files['/inputs/report.txt'] }];
            r.budget = { cap: 125, consumed: 20 };
            accept({ sources: r.retrieved, preference: r.memory.content, budget: r.budget, costProvenance: 'Synthetic fixture' });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
