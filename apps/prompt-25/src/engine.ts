import { DatabaseSync } from 'node:sqlite';
import type { Action, Data, Lesson, State } from './types.js';
export const inventory = [{ sku: 'BK-01', quantity: 12, price: 25 }, { sku: 'PN-02', quantity: 30, price: 2 }, { sku: 'NT-03', quantity: 8, price: 10 }];
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
        case 'database.create':
            r.databaseRows = inventory;
            accept({ engine: 'Actual node:sqlite, local classroom fixture', persistedRows: r.databaseRows });
            break;
        case 'database.query': {
            const db = new DatabaseSync(':memory:');
            try {
                db.exec('CREATE TABLE inventory(sku TEXT, quantity INTEGER, price INTEGER)');
                const insert = db.prepare('INSERT INTO inventory VALUES(?,?,?)');
                for (const row of r.databaseRows || inventory)
                    insert.run(row.sku, row.quantity, row.price);
                s.rows = db.prepare('SELECT sku, quantity * price AS value FROM inventory').all();
                accept({ query: 'SELECT SUM(quantity * price) AS total FROM inventory', ...db.prepare('SELECT SUM(quantity * price) AS total FROM inventory').get(), restoredFromSavedRows: true });
            }
            finally {
                db.close();
            }
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
