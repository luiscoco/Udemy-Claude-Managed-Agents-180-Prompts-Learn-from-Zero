const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
let defaults;
let report;
let selectedRow = 0;
let code = { sdk: '', http: '' };
let generation = 0;
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
function input() {
  return { sdkMode: $('#sdk-mode').value, rawAuth: $('#raw-auth').value,
    rawBeta: $('#raw-beta').value, rawVersion: $('#raw-version').value,
    differentBody: $('#different-body').checked };
}
function fill(settings) {
  $('#sdk-mode').value = settings.sdkMode;
  $('#raw-auth').value = settings.rawAuth;
  $('#raw-beta').value = settings.rawBeta;
  $('#raw-version').value = settings.rawVersion;
  $('#different-body').checked = settings.differentBody;
}
function controls() {
  document.querySelectorAll('#header-controls select, #header-controls input, #send').forEach(control => { control.disabled = busy; });
}
function clearReport() {
  report = undefined;
  $('#match-count').textContent = 'Awaiting requests';
  $('#creation-count').textContent = '0 fixture sessions';
  $('#session-observation').textContent = 'Send both requests with the current settings.';
  $('#comparison-rows').replaceChildren();
  for (const id of ['sdk-response', 'http-response', 'sdk-captured', 'http-captured', 'comparison-json']) {
    highlight(`#${id}`, JSON.stringify({ status: 'Awaiting requests' }, null, 2), 'json');
  }
  $('#sdk-status').textContent = '';
  $('#http-status').textContent = '';
}
async function preview() {
  const requestGeneration = ++generation;
  clearReport();
  try {
    const result = await api('/api/preview', input());
    if (requestGeneration !== generation) return;
    code = result;
    highlight('#sdk-code', code.sdk, 'typescript');
    highlight('#http-code', code.http, 'http');
  } catch (error) { if (requestGeneration === generation) notice(error.message); }
}
function renderComparisonValue() {
  highlight('#comparison-json', JSON.stringify(report.rows[selectedRow], null, 2), 'json');
  document.querySelectorAll('[data-row]').forEach(button => {
    const active = Number(button.dataset.row) === selectedRow;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderReport() {
  const matched = report.rows.filter(row => row.matches).length;
  $('#match-count').textContent = `${matched} / ${report.rows.length} core fields match`;
  $('#creation-count').textContent = `${report.created} fixture sessions`;
  $('#session-observation').textContent = report.created === 2
    ? 'Both requests created a session. Their IDs differ because each creation makes a separate resource.'
    : 'The SDK created a session. Inspect the raw HTTP fixture rejection and the differing header fields.';
  $('#comparison-rows').innerHTML = report.rows.map((row, index) => `<button class="comparison-row" data-row="${index}" data-matches="${row.matches}"><span>${escape(row.field)}</span><small>${row.matches ? 'Matches' : 'Differs'}</small></button>`).join('');
  selectedRow = Math.max(0, report.rows.findIndex(row => !row.matches));
  renderComparisonValue();
  for (const transport of ['sdk', 'http']) {
    const result = report[transport];
    $(`#${transport}-status`).textContent = `${result.status} · ${result.status === 200 ? 'Created' : 'Fixture rejected'}`;
    highlight(`#${transport}-response`, JSON.stringify(result.response, null, 2), 'json');
    highlight(`#${transport}-captured`, JSON.stringify(result.request, null, 2), 'json');
  }
}
$('#scenario').addEventListener('change', () => {
  if ($('#scenario').value === 'custom') return;
  const next = { ...defaults, sdkMode: $('#sdk-mode').value };
  const scenario = $('#scenario').value;
  if (scenario === 'missing-beta') next.rawBeta = 'missing';
  if (scenario === 'unsupported-beta') next.rawBeta = 'unsupported';
  if (scenario === 'missing-version') next.rawVersion = 'missing';
  if (scenario === 'unsupported-version') next.rawVersion = 'unsupported';
  if (scenario === 'missing-auth') next.rawAuth = 'missing';
  if (scenario === 'different-body') next.differentBody = true;
  fill(next);
  void preview();
});
for (const selector of ['#sdk-mode', '#raw-auth', '#raw-beta', '#raw-version', '#different-body']) {
  $(selector).addEventListener('change', () => {
    $('#scenario').value = 'custom';
    void preview();
  });
}
$('#send').addEventListener('click', async () => {
  busy = true; controls(); notice('');
  ++generation;
  try {
    const settings = input();
    code = await api('/api/preview', settings);
    highlight('#sdk-code', code.sdk, 'typescript');
    highlight('#http-code', code.http, 'http');
    report = await api('/api/run', settings);
    renderReport();
  } catch (error) { notice(error.message); }
  finally { busy = false; controls(); }
});
$('#comparison-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-row]');
  if (button && report) { selectedRow = Number(button.dataset.row); renderComparisonValue(); }
});
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(code[button.dataset.copy]); notice('Request code copied.'); }
  catch { notice('Select and copy the code with your keyboard.'); }
}));
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt08-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
  $('#present').setAttribute('aria-pressed', String(active));
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt08-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
highlight('#commands', 'Copy-Item .env.example .env\n# Edit .env with your key, agent ID and environment ID\n# Creates two real idle sessions with the same references\nnpm run headers:live', 'powershell');
clearReport();
try {
  const config = await api('/api/config');
  defaults = config.defaults;
  fill(defaults);
  await preview();
  controls();
} catch (error) { notice(error.message); }
