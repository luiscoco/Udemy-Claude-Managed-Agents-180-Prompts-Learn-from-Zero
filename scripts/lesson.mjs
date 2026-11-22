import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const [action, raw = '1'] = process.argv.slice(2);
const number = Number(raw);
if (!Number.isInteger(number) || number < 1 || number > 180) {
  console.error('Choose a lesson number from 1 to 180. Example: npm start -- 9'); process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('These course labs require Node.js 24 or later.'); process.exit(1);
}
const folder = resolve(fileURLToPath(new URL('../apps/', import.meta.url)), 'prompt-' + String(number).padStart(2, '0'));
const args = {setup:['ci','--workspaces=false'], start:['run','start','--workspaces=false'], check:['run','check','--workspaces=false'], browser:['exec','--workspaces=false','--','playwright','install','chromium'], 'test:browser':['run','test:e2e','--workspaces=false']}[action];
if (!args) { console.error('Unknown action'); process.exit(1); }
console.log('Lesson ' + number + ' · ' + action);
// npm exposes its own JS entry point, avoiding shell interpolation on Windows.
if (!process.env.npm_execpath) { console.error('Run this launcher through npm.'); process.exit(1); }
const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {cwd:folder, stdio:'inherit', env:process.env, windowsHide:true});
child.once('error', error => { console.error(error.message); process.exitCode=1; });
child.once('exit', code => { process.exitCode=code ?? 1; });
