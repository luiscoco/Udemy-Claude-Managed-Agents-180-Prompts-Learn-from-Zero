import assert from 'node:assert/strict';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root,'output/prompt-catalog.json'),'utf8'));
assert.equal(catalog.length,180);
assert.equal(new Set(catalog.map(x=>x.number)).size,180);
const errors=[];
for (let i=1;i<=180;i++) {
  const dir=path.join(root,'apps','prompt-'+String(i).padStart(2,'0'));
  for (const item of ['README.md','package.json','package-lock.json','src','public','tests']) {
    try { await access(path.join(dir,item)); } catch { errors.push('Missing lesson '+i+': '+item); }
  }
  const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
  if (!pkg.scripts?.start) errors.push('Missing start command: '+i);
}
let files=0; let bytes=0; let links=0;
const ignored=new Set(['node_modules','.git','artifacts','.runtime','test-results','playwright-report']);
async function walk(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if (ignored.has(entry.name)) continue;
    const file=path.join(dir,entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    files++; const metadata=await stat(file); bytes+=metadata.size;
    const relative=path.relative(root,file);
    if (entry.name.startsWith('.env') && entry.name!=='.env.example') errors.push('Environment file included: '+relative);
    if (/\.(pem|key|mp4|webm|mov)$/i.test(entry.name)) errors.push('Excluded file included: '+relative);
    if (metadata.size>50*1024*1024) errors.push('Oversized repository file: '+relative);
    if (entry.name.endsWith('.md')) {
      const content=await readFile(file,'utf8');
      for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target=match[1];
        if (/^(?:https?:|mailto:|#)/.test(target)) continue;
        links++;
        const local=target.split('#')[0];
        try { await access(path.resolve(path.dirname(file),decodeURIComponent(local))); }
        catch { errors.push('Broken local link in '+relative+': '+local); }
      }
    }
    if (/\.(?:ts|js|mjs|json|md|html|yml|yaml|txt|example)$/i.test(entry.name) && metadata.size<3*1024*1024) {
      const content=await readFile(file,'utf8');
      // Only report paths; never print any potential credential value.
      if (/sk-ant-(?:api\d*|usr)-[A-Za-z0-9_-]{40,}/.test(content) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) errors.push('Potential credential in '+relative);
    }
  }
}
await walk(root);
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log(JSON.stringify({passed:true,applications:180,sections:new Set(catalog.map(x=>x.section)).size,files,bytes,localMarkdownLinksChecked:links},null,2));
