const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const fields = { agentPath: '#agent-path', agentName: '#agent-name', model: '#model',
  system: '#system', environmentName: '#environment-name', network: '#network' };
let state;
let files = [];
let reviewed;
let selectedRow = 0;
let selectedFile = 'agent';
let currentDefinition;
let busy = false;
let generation = 0;
let sourceGeneration = 0;
let refreshTimer;

function highlight(selector, text, language) {
  const element = $(selector);
  element.className = `language-${language}`;
  if (language === 'markdown') {
    const frontmatter = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/);
    if (frontmatter) {
      element.innerHTML = Prism.highlight(frontmatter[1], Prism.languages.markdown, 'markdown')
        + Prism.highlight(frontmatter[2], Prism.languages.yaml, 'yaml')
        + Prism.highlight(frontmatter[3] + frontmatter[4], Prism.languages.markdown, 'markdown');
      return;
    }
  }
  element.innerHTML = Prism.highlight(text, Prism.languages[language], language);
}
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operation failed.');
  return result;
}
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
function input() {
  return { editor: Object.fromEntries(Object.entries(fields).map(([name, selector]) => [name, $(selector).value])),
    missingLock: $('#missing-lock').checked };
}
function controls() {
  for (const selector of Object.values(fields)) $(selector).disabled = busy;
  for (const selector of ['#revise', '#review', '#missing-lock']) $(selector).disabled = busy;
  $('#apply').disabled = busy || !reviewed || reviewed.plan.blocked;
  $('#download-definition').disabled = !currentDefinition || busy;
}
function invalidate() {
  reviewed = undefined;
  ++generation;
  clearTimeout(refreshTimer);
  $('#plan-summary').textContent = 'Definitions changed. Review a fresh plan.';
  $('#plan-rows').replaceChildren();
  $('#plan-warnings').replaceChildren();
  highlight('#diff', JSON.stringify({ status: 'Review required' }, null, 2), 'json');
  controls();
}
function renderDefinition() {
  if (selectedFile === 'src/reconciler.ts') return;
  currentDefinition = files.find(file => file.path.startsWith(selectedFile === 'agent' ? './agents/' : './environments/'));
  if (!currentDefinition) return;
  $('#filename').textContent = currentDefinition.path;
  const language = selectedFile === 'agent' ? 'markdown' : 'yaml';
  $('#language').textContent = language === 'markdown' ? 'Markdown + YAML frontmatter' : 'YAML';
  highlight('#source', currentDefinition.text, language);
  controls();
}
async function refreshDefinitions() {
  const requestGeneration = ++generation;
  try {
    const result = await api('/api/preview', input());
    if (requestGeneration !== generation) return;
    files = result.files;
    renderDefinition();
    $('#definition-status').textContent = 'Definition preview is current. Review the plan before applying.';
  } catch (error) { if (requestGeneration === generation) notice(error.message); }
}
function renderPlan() {
  const plan = reviewed.plan;
  $('#plan-summary').textContent = `${plan.summary.created} to create · ${plan.summary.updated} to update · ${plan.summary.unchanged} unchanged`;
  $('#plan-warnings').innerHTML = plan.warnings.map(warning => `<p>${escape(warning)}</p>`).join('');
  $('#plan-rows').innerHTML = plan.rows.map((row, index) => `<button class="plan-row" data-row="${index}" data-action="${row.action}"><strong>${escape(row.path)}</strong><span>${escape(row.action)}${row.changedFields.length ? ` · ${escape(row.changedFields.join(', '))}` : ''}</span></button>`).join('');
  selectedRow = Math.max(0, plan.rows.findIndex(row => row.action === 'update'));
  renderDiff();
  controls();
}
function renderDiff() {
  highlight('#diff', JSON.stringify(reviewed.plan.rows[selectedRow], null, 2), 'json');
  document.querySelectorAll('[data-row]').forEach(button => {
    const active = Number(button.dataset.row) === selectedRow;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderState() {
  highlight('#lock-json', JSON.stringify(state.lock || { status: 'First apply will create the classroom lockfile' }, null, 2), 'json');
  $('#download-lock').hidden = !state.lock;
  $('#resource-count').textContent = `${state.remote.length} local resources`;
  const last = state.history.at(-1);
  const previous = state.history.at(-2);
  $('#continuity').textContent = last
    ? `Agent ${last.agentId} · version ${last.agentVersion}${previous ? previous.agentId === last.agentId ? ' · same ID as the previous apply' : ' · a different agent ID was created' : ' · first saved mapping'}`
    : 'Apply the first plan to save resource IDs.';
  $('#history').innerHTML = state.history.map(run => `<tr><td>${run.number}</td><td>${run.created}</td><td>${run.updated}</td><td>${run.unchanged}</td><td>${run.agentVersion}</td><td>${escape(run.agentId)}</td></tr>`).join('');
  const tracked = new Set(Object.values(state.lock?.resources || {}).map(entry => entry.id));
  $('#inventory').innerHTML = state.remote.map(resource => `<article class="inventory-item"><strong>${escape(resource.config.name)}</strong><small>${escape(resource.kind)}${resource.agentVersion ? ` · version ${resource.agentVersion}` : ''}<br>${escape(resource.id)}<br>${tracked.has(resource.id) ? 'Tracked by the classroom lockfile' : 'Untracked in the current classroom lockfile'}</small></article>`).join('');
}
$('#review').addEventListener('click', async () => {
  clearTimeout(refreshTimer);
  ++generation;
  busy = true; controls(); notice('');
  const request = input();
  try {
    const result = await api('/api/preview', request);
    files = result.files;
    reviewed = { input: request, plan: result.plan };
    renderDefinition(); renderPlan();
  } catch (error) { reviewed = undefined; notice(error.message); }
  finally { busy = false; controls(); }
});
$('#apply').addEventListener('click', async () => {
  if (!reviewed) return;
  busy = true; controls(); notice('');
  const request = { ...reviewed.input, token: reviewed.plan.token };
  try {
    state = await api('/api/apply', request);
    const last = state.history.at(-1);
    $('#missing-lock').checked = false;
    renderState();
    invalidate();
    $('#plan-summary').textContent = `Applied · ${last.created} created · ${last.updated} updated · ${last.unchanged} unchanged`;
    notice('Classroom apply saved. Inspect the lockfile and review the next plan.');
  } catch (error) {
    reviewed = undefined;
    notice(error.message);
    try { state = await api('/api/state'); renderState(); }
    catch { notice(`${error.message} Reload when the server is available to inspect saved state.`); }
  } finally { busy = false; controls(); }
});
document.querySelectorAll('.editor input, .editor select, .editor textarea').forEach(control => control.addEventListener('input', () => {
  invalidate();
  $('#definition-status').textContent = 'Refreshing definition preview…';
  refreshTimer = setTimeout(() => { void refreshDefinitions(); }, 200);
}));
$('#missing-lock').addEventListener('change', invalidate);
$('#revise').addEventListener('click', () => {
  $('#system').value = 'Summarize supplied text and cite supporting passages.\nReturn findings as a numbered list.';
  invalidate(); void refreshDefinitions();
});
$('#plan-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-row]');
  if (button && reviewed) { selectedRow = Number(button.dataset.row); renderDiff(); }
});
document.querySelectorAll('[data-file]').forEach(button => button.addEventListener('click', async () => {
  selectedFile = button.dataset.file;
  const requestGeneration = ++sourceGeneration;
  document.querySelectorAll('[data-file]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active));
  });
  if (selectedFile !== 'src/reconciler.ts') renderDefinition();
  else {
    currentDefinition = undefined; controls();
    try {
      const source = await api('/api/source?name=src%2Freconciler.ts');
      if (requestGeneration !== sourceGeneration) return;
      $('#filename').textContent = source.name;
      $('#language').textContent = 'TypeScript · local teaching model';
      highlight('#source', source.text, 'typescript');
    } catch (error) { notice(error.message); }
  }
  $('#source').parentElement.scrollTop = 0;
}));
$('#download-definition').addEventListener('click', () => {
  if (!currentDefinition) return;
  const url = URL.createObjectURL(new Blob([currentDefinition.text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url; link.download = currentDefinition.path.split('/').at(-1); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt07-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
  $('#present').setAttribute('aria-pressed', String(active));
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt07-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
highlight('#diff', JSON.stringify({ status: 'Awaiting plan review' }, null, 2), 'json');
highlight('#commands', 'Set-Location definitions\nant auth login\nant apply --dry-run .\nant apply .\n\n# Edit agents/reviewer.md, then review and apply again\nant apply --dry-run .\nant apply .\nGet-Content claude-lock.json', 'powershell');
try {
  const [config, saved] = await Promise.all([api('/api/config'), api('/api/state')]);
  state = saved;
  for (const [name, selector] of Object.entries(fields)) $(selector).value = config.editor[name];
  renderState();
  await refreshDefinitions();
  controls();
} catch (error) { notice(error.message); }
