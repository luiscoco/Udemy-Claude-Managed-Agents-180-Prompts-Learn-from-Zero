const $ = selector => document.querySelector(selector);
let mode = 'api-key';
let sourceText = '';
let sourceGeneration = 0;
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function highlight(selector, text, language) {
  const element = $(selector);
  element.className = `language-${language}`;
  element.innerHTML = Prism.highlight(text, Prism.languages[language], language);
}
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operation failed.');
  return result;
}
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
function resetResult() {
  $('#result-status').textContent = 'Not checked';
  $('#result-status').dataset.state = '';
  $('#trace').textContent = 'Run the check with your selected fixture settings.';
  $('#fixture-count').textContent = '0';
  $('#outcome-message').textContent = 'Ready for your next experiment.';
  highlight('#evidence', JSON.stringify({ scope:'Local fixture', status:'Awaiting check', externalNetworkRequests:0 }, null, 2), 'json');
}
function selectMode(next) {
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#source-name').textContent = mode === 'api-key' ? 'Environment' : 'Local CLI login';
  $('#mode-help').textContent = mode === 'api-key' ? 'API-key path: the server reads ANTHROPIC_API_KEY and passes it explicitly to the SDK.' : 'CLI path: the fixture models a login credential provider. Real login happens only through ant in your terminal.';
  resetResult();
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
$('#credential').addEventListener('change', resetResult);
$('#resource').addEventListener('change', resetResult);
$('#run').addEventListener('click', async () => {
  $('#run').disabled = true;
  document.querySelectorAll('[data-mode], #credential, #resource').forEach(control => { control.disabled = true; });
  try {
    const result = await api('/api/run', { mode, credential:$('#credential').value, resource:$('#resource').value });
    $('#result-status').textContent = result.status ? `${result.status} · ${result.outcome === 'success' ? 'Access verified' : 'Check failed'}` : 'Stopped locally';
    $('#result-status').dataset.state = result.outcome;
    $('#trace').innerHTML = result.trace.map(item => `<div class="trace-row"><b>${escape(item.step)}</b><span>${escape(item.detail)}</span></div>`).join('');
    $('#outcome-message').textContent = result.message;
    $('#fixture-count').textContent = result.requests;
    highlight('#evidence', JSON.stringify(result.evidence, null, 2), 'json');
  } catch (error) { notice(error.message); }
  finally {
    $('#run').disabled = false;
    document.querySelectorAll('[data-mode], #credential, #resource').forEach(control => { control.disabled = false; });
  }
});
async function showSource(name) {
  const generation = ++sourceGeneration;
  try {
    const source = await api(`/api/source?name=${encodeURIComponent(name)}`);
    if (generation !== sourceGeneration) return;
    sourceText = source.text;
    $('#filename').textContent = source.name;
    highlight('#source', source.text, source.language);
    $('#source').parentElement.scrollTop = 0;
    document.querySelectorAll('[data-file]').forEach(button => {
      const active = button.dataset.file === name;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
  } catch (error) { notice(error.message); }
}
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(sourceText); notice('Source copied.'); }
  catch { notice('Select and copy the source with your keyboard.'); }
});
$('#server-status').addEventListener('click', async () => {
  try {
    const report = await api('/api/server-status', {});
    $('#server-result').textContent = `Server API key: ${report.apiKeyConfigured ? 'configured' : 'missing'}. Agent ID: ${report.agentIdConfigured ? 'configured' : 'missing'}. Presence only; access unverified. CLI login not inspected. No provider request sent.`;
  } catch (error) { notice(error.message); }
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt04-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
  $('#present').setAttribute('aria-pressed', String(active));
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt04-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
selectMode('api-key');
highlight('#api-commands', 'Copy-Item .env.example .env\n# Edit .env locally: API key + AGENT_ID\n# Optional read-only provider request:\nnpm run auth:check', 'powershell');
highlight('#cli-commands', 'ant auth login --profile lesson\nant auth status --profile lesson\n# Set AGENT_ID in your local .env\n# Optional read-only provider request:\nnpm run auth:cli', 'powershell');
try {
  const config = await api('/api/config');
  $('#files').innerHTML = config.sources.map(name => `<button data-file="${escape(name)}" aria-pressed="false">${escape(name)}</button>`).join('');
  $('#files').addEventListener('click', event => {
    const button = event.target.closest('[data-file]');
    if (button) void showSource(button.dataset.file);
  });
  await showSource('src/api-client.ts');
} catch (error) { notice(error.message); }
