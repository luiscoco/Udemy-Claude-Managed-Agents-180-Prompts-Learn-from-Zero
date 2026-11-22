const $ = selector => document.querySelector(selector);
let currentSource = '';
let sourceGeneration = 0;
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function highlight(selector, text, language) {
  const element = $(selector);
  element.className = `language-${language}`;
  element.innerHTML = Prism.highlight(text, Prism.languages[language], language);
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operation failed.');
  return result;
}
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
function render(report) {
  $('#result-status').textContent = report.ready ? 'Ready locally' : 'Setup blocked';
  $('#result-status').dataset.state = report.ready ? 'ready' : 'blocked';
  $('#request-count').textContent = report.providerRequests;
  $('#trace').innerHTML = report.trace.map(item => `<div class="check-row"><span class="check-icon">${item.state === 'passed' ? '✓' : item.state === 'failed' ? '!' : '○'}</span><b>${escape(item.step)}</b><span>${escape(item.state)}</span></div>`).join('');
  $('#issues').innerHTML = report.issues.map(issue => `<div class="issue"><strong>${escape(issue.field)}</strong>${escape(issue.message)}</div>`).join('');
  $('#result-explanation').textContent = report.ready ? 'Local setup passed. Resource existence, credentials and account access still need a real provider request. The plan below has not been sent.' : 'Fix the failed checks, then validate again. No provider request has been sent.';
  highlight('#report', JSON.stringify(report, null, 2), 'json');
}
$('#scenario').addEventListener('change', () => {
  const scenario = $('#scenario').value;
  $('#key').value = scenario === 'key' ? 'missing' : 'present';
  $('#agent').value = scenario === 'agent' ? '' : 'agent_classroom';
  $('#environment').value = scenario === 'environment' ? '' : 'env_classroom';
  $('#missing-surface').checked = scenario === 'sdk';
});
$('#validate').addEventListener('click', async () => {
  $('#validate').disabled = true;
  try {
    render(await api('/api/validate', { keyPresent:$('#key').value === 'present', agentId:$('#agent').value,
      environmentId:$('#environment').value, missingSurface:$('#missing-surface').checked }));
    notice('Validation complete · 0 provider requests');
  } catch (error) { notice(error.message); }
  finally { $('#validate').disabled = false; }
});
async function showSource(name) {
  const generation = ++sourceGeneration;
  try {
    const source = await api(`/api/source?name=${encodeURIComponent(name)}`);
    if (generation !== sourceGeneration) return;
    currentSource = source.text;
    $('#filename').textContent = source.name;
    $('#language').textContent = source.language === 'typescript' ? 'TypeScript' : 'JSON';
    highlight('#source', source.text, source.language);
    document.querySelectorAll('[data-file]').forEach(button => {
      const active = button.dataset.file === name;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
  } catch (error) { notice(error.message); }
}
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentSource); notice('Source copied.'); }
  catch { notice('Select the source text and copy it with your keyboard.'); }
});
$('#server-check').addEventListener('click', async () => {
  try {
    const report = await api('/api/server-check', {});
    $('#server-result').textContent = report.ready ? 'Server setup passed locally. No provider request sent.' : `Server setup blocked: ${report.issues.map(i => i.field).join(', ')}. No provider request sent.`;
  } catch (error) { notice(error.message); }
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt03-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').setAttribute('aria-pressed', String(active));
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt03-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
highlight('#commands', 'npm ci\nCopy-Item .env.example .env\n# Edit .env with your own values\nnpm start', 'powershell');
highlight('#live-commands', '# Offline configuration and SDK checks\nnpm run setup:check\n\n# Optional: creates a real provider resource\nnpm run session:create', 'powershell');
highlight('#report', JSON.stringify({ status:'Awaiting validation', providerRequests:0 }, null, 2), 'json');
try {
  const config = await api('/api/config');
  $('#runtime').textContent = `Node ${config.runtime.node} · SDK ${config.runtime.sdk}`;
  $('#files').innerHTML = Object.keys(config.sources).map(name => `<button data-file="${escape(name)}" aria-pressed="false">${escape(name)}</button>`).join('');
  $('#files').addEventListener('click', event => {
    const button = event.target.closest('[data-file]');
    if (button) void showSource(button.dataset.file);
  });
  await showSource('src/config.ts');
} catch (error) { notice(error.message); }
