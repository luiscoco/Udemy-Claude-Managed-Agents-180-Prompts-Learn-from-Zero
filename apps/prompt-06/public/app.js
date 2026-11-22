const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
let capture;
let comparison;
let activeComparison = 0;
let selectedFile = 'generated';
let currentCode = '';
let previewGeneration = 0;
let sourceGeneration = 0;
let busy = false;

function highlight(selector, text, language) {
  const element = $(selector);
  element.className = `language-${language}`;
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
function form(prefix) {
  return `<label for="${prefix}-name">Agent name</label><input id="${prefix}-name" maxlength="100">
    <label for="${prefix}-model">Model</label><select id="${prefix}-model"><option value="classroom-reviewer">Classroom reviewer model</option><option value="classroom-alternate">Alternate model fixture</option></select>
    <label for="${prefix}-system">System instructions</label><textarea id="${prefix}-system" rows="2" maxlength="2000"></textarea>
    <div class="form-pair"><div><label for="${prefix}-tool">Enabled tool</label><select id="${prefix}-tool"><option value="none">No tools</option><option value="read">Read tool fixture</option></select></div><div><label for="${prefix}-permission">Read tool permission</label><select id="${prefix}-permission"><option value="always_allow">Always allow</option><option value="always_ask">Ask for confirmation</option></select></div></div>
    <label for="${prefix}-environment">Environment and networking</label><select id="${prefix}-environment"><option value="demo_env_limited">Classroom cloud · limited network</option><option value="demo_env_open">Classroom cloud · unrestricted network</option></select>
    <label for="${prefix}-task">Exact test input</label><textarea id="${prefix}-task" rows="3" maxlength="4000"></textarea>`;
}
const fields = ['name', 'model', 'system', 'tool', 'permission', 'environment', 'task'];
function fillForm(prefix, profile) { for (const field of fields) $(`#${prefix}-${field}`).value = profile[field]; }
function readForm(prefix) { return Object.fromEntries(fields.map(field => [field, $(`#${prefix}-${field}`).value])); }
function controls() {
  document.querySelectorAll('#console-form input, #console-form select, #console-form textarea').forEach(control => { control.disabled = busy; });
  const reuse = $('#strategy').value === 'reuse';
  for (const field of fields) {
    const agentField = ['name', 'model', 'system', 'tool', 'permission'].includes(field);
    $(`#api-${field}`).disabled = busy || !capture || (reuse && agentField) || field === 'name';
  }
  $('#console-permission').disabled = busy || $('#console-tool').value === 'none';
  $('#api-permission').disabled ||= $('#api-tool').value === 'none';
  for (const selector of ['#strategy', '#scenario', '#api-test', '#download']) $(selector).disabled = busy || !capture;
  $('#console-test').disabled = busy;
}
function requestInput() {
  return { baseline: capture.profile, candidate: readForm('api'),
    strategy: $('#strategy').value, consoleAgentId: capture.result.agentId };
}
function renderResult(selector, result) {
  $(selector).innerHTML = `<h3 class="outcome">${escape(result.outcome)}</h3><p class="answer">${escape(result.response || 'The tool call is waiting for confirmation.')}</p>
    <div class="result-facts"><span>${escape(result.status)}</span><span>${escape(result.stopReason)}</span><span>Observed tools: ${escape(result.observedTools.join(', ') || 'none')}</span></div>
    <p class="result-reference">Agent ${escape(result.agentId)}<br>Session ${escape(result.sessionId)}</p>
    <details><summary>Inspect session events · JSON</summary><pre tabindex="0"><code id="${selector.slice(1)}-events" class="language-json"></code></pre></details>`;
  highlight(`${selector}-events`, JSON.stringify(result.events, null, 2), 'json');
}
function renderComparison() {
  const matched = comparison.rows.filter(row => row.matches).length;
  $('#match-count').textContent = `${matched} / ${comparison.rows.length} fields match`;
  $('#comparison-rows').innerHTML = comparison.rows.map((row, index) => `<button class="comparison-row" data-compare="${index}" data-matches="${row.matches}"><span>${escape(row.field)}</span><small>${row.matches ? 'Matches' : 'Differs'}</small></button>`).join('');
  const firstDifference = comparison.rows.findIndex(row => !row.matches);
  activeComparison = firstDifference >= 0 ? firstDifference : 0;
  renderComparisonValue();
  if (selectedFile === 'generated') renderGenerated();
}
function renderComparisonValue() {
  highlight('#comparison-json', JSON.stringify(comparison.rows[activeComparison], null, 2), 'json');
  document.querySelectorAll('[data-compare]').forEach(button => {
    const active = Number(button.dataset.compare) === activeComparison;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderGenerated() {
  currentCode = comparison?.code || '// Run the Console rehearsal to capture a configuration.';
  $('#filename').textContent = 'Generated API code';
  $('#code-description').textContent = 'TypeScript generated from the classroom configuration. Replace synthetic references with your own Console values for account-backed use.';
  highlight('#source', currentCode, 'typescript');
}
async function preview() {
  if (!capture) return;
  const generation = ++previewGeneration;
  $('#api-result').innerHTML = '<p class="helper">Run the API test with this configuration.</p>';
  $('#strategy-help').textContent = $('#strategy').value === 'reuse'
    ? 'The tested agent ID is reused. Environment and task remain session inputs.'
    : 'agents.create makes a separate agent resource from the captured configuration.';
  controls();
  try {
    const result = await api('/api/preview', requestInput());
    if (generation !== previewGeneration) return;
    comparison = result;
    renderComparison();
  } catch (error) { notice(error.message); }
}
$('#console-test').addEventListener('click', async () => {
  const profile = readForm('console');
  busy = true; controls(); notice('');
  try {
    capture = await api('/api/console-test', profile);
    renderResult('#console-result', capture.result);
    fillForm('api', capture.profile);
    $('#scenario').value = 'same';
    $('#strategy').value = 'reproduce';
    await preview();
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
});
$('#api-test').addEventListener('click', async () => {
  busy = true; controls(); notice('');
  ++previewGeneration;
  try {
    comparison = await api('/api/api-test', requestInput());
    renderComparison();
    renderResult('#api-result', comparison.result);
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
});
$('#console-form').addEventListener('input', () => {
  capture = undefined;
  comparison = undefined;
  ++previewGeneration;
  $('#console-result').innerHTML = '<p class="helper">Run a new rehearsal to capture these changes.</p>';
  $('#api-result').innerHTML = '<p class="helper">Capture a Console baseline first.</p>';
  $('#comparison-rows').replaceChildren();
  $('#match-count').textContent = 'Awaiting baseline';
  highlight('#comparison-json', JSON.stringify({ status: 'Capture a new baseline' }, null, 2), 'json');
  if (selectedFile === 'generated') renderGenerated();
  controls();
});
$('#api-form').addEventListener('input', () => { void preview(); });
$('#strategy').addEventListener('change', () => {
  if ($('#strategy').value === 'reuse') {
    const candidate = readForm('api');
    fillForm('api', { ...capture.profile, environment: candidate.environment, task: candidate.task });
  }
  void preview();
});
$('#scenario').addEventListener('change', () => {
  const candidate = { ...capture.profile };
  const scenario = $('#scenario').value;
  if (scenario === 'instructions') candidate.system = 'Give a brief summary.';
  if (scenario === 'model') candidate.model = candidate.model === 'classroom-reviewer' ? 'classroom-alternate' : 'classroom-reviewer';
  if (scenario === 'tools') { candidate.tool = 'read'; candidate.permission = 'always_ask'; }
  if (scenario === 'environment') candidate.environment = candidate.environment === 'demo_env_limited' ? 'demo_env_open' : 'demo_env_limited';
  if (scenario === 'input') candidate.task = 'Review this note. The release is Thursday. The owner is Noah. Identify the release day and owner.';
  if (['instructions', 'model', 'tools'].includes(scenario)) $('#strategy').value = 'reproduce';
  fillForm('api', candidate);
  void preview();
});
$('#comparison-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-compare]');
  if (button) { activeComparison = Number(button.dataset.compare); renderComparisonValue(); }
});
document.querySelectorAll('[data-file]').forEach(button => button.addEventListener('click', async () => {
  selectedFile = button.dataset.file;
  const generation = ++sourceGeneration;
  document.querySelectorAll('[data-file]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active));
  });
  if (selectedFile === 'generated') renderGenerated();
  else {
    try {
      const source = await api(`/api/source?name=${encodeURIComponent(selectedFile)}`);
      if (generation !== sourceGeneration) return;
      currentCode = source.text;
      $('#filename').textContent = source.name;
      $('#code-description').textContent = 'Actual TypeScript file served from this project.';
      highlight('#source', source.text, source.language);
    } catch (error) { notice(error.message); }
  }
  $('#source').parentElement.scrollTop = 0;
}));
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentCode); notice('Code copied.'); }
  catch { notice('Select and copy the code with your keyboard.'); }
});
$('#download').addEventListener('click', () => {
  const profile = { scope: 'Classroom fixture', consoleAgentId: capture.result.agentId,
    environmentId: capture.profile.environment, agent: capture.request, environmentSnapshot: capture.environment,
    task: capture.profile.task };
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'classroom-console-profile.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt06-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
  $('#present').setAttribute('aria-pressed', String(active));
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt06-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
highlight('#commands', 'Copy-Item .env.example .env\nCopy-Item console-profile.example.json console-profile.json\n# Edit both files with your actual Console values\nnpm run console:reproduce\n\n# Or reuse the existing Console-created agent\nnpm run console:reuse', 'powershell');
highlight('#comparison-json', JSON.stringify({ status: 'Awaiting a tested Console configuration' }, null, 2), 'json');
renderGenerated();
try {
  const config = await api('/api/config');
  $('#console-form').innerHTML = form('console');
  $('#api-form').innerHTML = form('api');
  fillForm('console', config.defaultProfile);
  fillForm('api', config.defaultProfile);
  controls();
} catch (error) { notice(error.message); }
