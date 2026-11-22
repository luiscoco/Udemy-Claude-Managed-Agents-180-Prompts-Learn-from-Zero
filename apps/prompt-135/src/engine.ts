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
        case 'workflow.start':
            r.workflow = { id: 'demo_workflow', status: 'running', phases: [{ name: 'research', status: 'completed' }, { name: 'verify', status: 'running' }] };
            r.workflowEvents = [{ phase: 'research', status: 'completed' }, { phase: 'verify', status: 'running' }];
            accept({ workflow: r.workflow });
            break;
        case 'workflow.interruptMain':
            r.mainStatus = 'idle';
            accept({ main: 'idle', workflow: r.workflow?.status, backgroundStillRunning: r.workflow?.status === 'running' });
            break;
        case 'workflow.stop':
            r.workflow.status = 'terminated';
            accept({ workflow: 'terminated' });
            break;
        case 'workflow.detect':
            accept({ fullyStopped: r.mainStatus === 'idle' && r.workflow?.status === 'terminated', main: r.mainStatus, workflow: r.workflow?.status });
            break;
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
