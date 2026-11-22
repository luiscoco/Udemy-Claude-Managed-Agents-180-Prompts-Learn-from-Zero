import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Action, Data, Lesson, State } from './types.js';
export const inventory = [{ sku: 'BK-01', quantity: 12, price: 25 }, { sku: 'PN-02', quantity: 30, price: 2 }, { sku: 'NT-03', quantity: 8, price: 10 }];
export const total = inventory.reduce((sum, row) => sum + row.quantity * row.price, 0);
const root = new URL('../.runtime/', import.meta.url);
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
        case 'browser.inspect':
            accept({ target: '/fixture/inventory', implementation: 'Playwright launches local Chrome and captures only this application fixture.' });
            break;
        case 'browser.capture': {
            const { chromium } = await import('@playwright/test');
            const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
            try {
                const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
                await page.setContent('<html><body style="font:24px sans-serif;background:#eaf2ff;padding:60px"><h1>Approved inventory</h1><p>BK-01: $300 · PN-02: $60 · NT-03: $80</p><strong>Total: USD 440</strong></body></html>');
                await mkdir(root, { recursive: true });
                const path = new URL('browser-fixture.png', root);
                await page.screenshot({ path: fileURLToPath(path) });
                s.artifacts.push({ name: 'browser-fixture.png', path: 'browser-fixture.png' });
                accept({ title: await page.locator('h1').innerText(), total: await page.locator('strong').innerText(), engine: 'Actual Playwright / local HTML fixture' });
            }
            finally {
                await browser.close();
            }
            break;
        }
        default: throw new Error(`Unimplemented operation: ${op}`);
    }
    s.result = result;
    s.events.push({ sequence: s.revision, operation: op, label: action.label, status: s.status, accepted: result.accepted, summary: result.reason || action.label });
    return s;
}
