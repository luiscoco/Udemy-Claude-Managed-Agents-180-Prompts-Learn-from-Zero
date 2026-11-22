const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
let state;
let selectedEvent;
let sourceText = '';
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
function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
}
function render() {
  const response = state.events.filter(event => event.type === 'agent.message' && event.text);
  const complete = state.status === 'idle' && state.stopReason === 'end_turn' && response.length > 0;
  $('#agent-progress').textContent = state.agentId ? 'ID saved' : 'Create first';
  $('#environment-progress').textContent = state.environmentId ? 'ID saved' : 'Waiting';
  $('#session-progress').textContent = state.sessionId ? 'ID saved' : 'Waiting';
  $('#response-progress').textContent = complete ? 'Turn finished' : state.sessionId ? 'Following events' : 'Waiting';
  $('#create-agent').disabled = busy || Boolean(state.agentId) || Boolean(state.pending);
  $('#create-environment').disabled = busy || !state.agentId || Boolean(state.environmentId) || Boolean(state.pending);
  $('#start-session').disabled = busy || !state.environmentId || Boolean(state.sessionId) || Boolean(state.pending);
  $('#observe').disabled = busy || !state.sessionId;
  for (const selector of ['#name', '#model', '#system']) $(selector).disabled = busy || Boolean(state.agentId);
  $('#task').disabled = busy || Boolean(state.sessionId);
  if (state.settings) {
    $('#name').value = state.settings.name;
    $('#model').value = state.settings.model;
    $('#system').value = state.settings.system;
  }
  if (state.task) $('#task').value = state.task;
  $('#session-status').textContent = complete ? 'Turn finished' : state.status;
  $('#session-status').dataset.complete = String(complete);
  $('#state-value').textContent = state.status;
  $('#stop-reason').textContent = state.stopReason || 'pending';
  $('#session-reference').textContent = state.sessionId || 'Start a session to submit the selected user message.';
  $('#transcript').innerHTML = state.sessionId
    ? `<article class="message"><b>Your task</b><p>${escape(state.task)}</p></article>${response.map(event => `<article class="message agent-message"><b>Agent · scripted classroom response</b><p>${escape(event.text)}</p></article>`).join('')}`
    : '<p class="helper">The agent\'s response will appear here.</p>';
  $('#completion').textContent = complete
    ? 'A response is recorded. The session is idle with stop reason end_turn.'
    : state.sessionId ? 'Task accepted. Read history to check for a response and the latest session state.'
      : 'Follow the events after your session is accepted.';
  $('#event-count').textContent = `${state.events.length} events`;
  $('#events').innerHTML = state.events.map(event => `<button class="event-row" data-event="${escape(event.id)}">${escape(event.type)}<small>${escape(event.id)}</small></button>`).join('');
  if (!state.events.some(event => event.id === selectedEvent)) selectedEvent = state.events.at(-1)?.id;
  renderEvent();
  highlight('#ids', JSON.stringify({ mode: state.mode, agentId: state.agentId,
    environmentId: state.environmentId, sessionId: state.sessionId }, null, 2), 'json');
  if (state.pending && $('#notice').hidden) {
    notice(`Inspect the pending ${state.pending} creation in the saved resource file before continuing.`);
  }
}
function renderEvent() {
  const event = state.events.find(event => event.id === selectedEvent);
  highlight('#event-json', JSON.stringify(event || { status: 'Awaiting session events' }, null, 2), 'json');
  document.querySelectorAll('[data-event]').forEach(button => {
    const active = button.dataset.event === selectedEvent;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
async function act(path, input) {
  busy = true;
  render();
  notice('');
  try { state = await api(path, input); }
  catch (error) {
    notice(error.message);
    try { state = await api('/api/state'); }
    catch { notice(`${error.message} Reload to inspect the saved workflow when the server is available.`); }
  } finally { busy = false; render(); }
}
$('#create-agent').addEventListener('click', () => act('/api/agent', {
  name: $('#name').value, model: $('#model').value, system: $('#system').value,
}));
$('#create-environment').addEventListener('click', () => act('/api/environment', {}));
$('#start-session').addEventListener('click', () => act('/api/session', { task: $('#task').value }));
$('#observe').addEventListener('click', () => act('/api/observe', {}));
$('#events').addEventListener('click', event => {
  const button = event.target.closest('[data-event]');
  if (button) { selectedEvent = button.dataset.event; renderEvent(); }
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
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  } catch (error) { notice(error.message); }
}
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(sourceText); notice('Source copied.'); }
  catch { notice('Select and copy the source with your keyboard.'); }
});
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  try { localStorage.setItem('prompt05-theme', dark ? 'dark' : 'light'); } catch {}
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
function setPresentation(active) {
  document.body.classList.toggle('presentation', active);
  $('#present').textContent = active ? 'Exit presentation' : 'Presentation view';
  $('#present').setAttribute('aria-pressed', String(active));
}
$('#present').addEventListener('click', () => setPresentation(!document.body.classList.contains('presentation')));
try { setTheme(localStorage.getItem('prompt05-theme') === 'dark'); } catch { setTheme(false); }
setPresentation(new URLSearchParams(location.search).get('presentation') === '1');
highlight('#commands', 'Copy-Item .env.example .env\n# Edit .env with your API key and MODEL_ID\n# Creates provider resources and runs the task\nnpm run agent:run', 'powershell');
try {
  const config = await api('/api/config');
  $('#task').innerHTML = config.tasks.map(task => `<option>${escape(task)}</option>`).join('');
  $('#files').innerHTML = config.sources.map(name => `<button data-file="${escape(name)}" aria-pressed="false">${escape(name)}</button>`).join('');
  $('#files').addEventListener('click', event => {
    const button = event.target.closest('[data-file]');
    if (button) void showSource(button.dataset.file);
  });
  state = await api('/api/state');
  render();
  await showSource('src/resources.ts');
} catch (error) { notice(error.message); }
