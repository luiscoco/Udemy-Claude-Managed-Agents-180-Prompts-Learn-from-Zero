const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let config;
let mode = 'demo';
let available = { agents: [], environments: [] };
let sessions = [];
let selectedId = null;
let busy = false;
let codeTab = 'create';
let resource = 'agent';
let selectedEvent = null;

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
}
try { applyTheme(localStorage.getItem('prompt-02-theme')); } catch { applyTheme('light'); }
$('#theme-toggle').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('prompt-02-theme', theme); } catch { /* Keep the current theme without storage. */ }
};

function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(35000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'The request could not finish.');
  return value;
}
function current() { return sessions.find(session => session.id === selectedId); }
function update(session) {
  const index = sessions.findIndex(item => item.id === session.id);
  if (index < 0) sessions.push(session); else sessions[index] = session;
}
function highlight(selector, value, language) {
  $(selector).innerHTML = Prism.highlight(value, Prism.languages[language], language);
}
function inspectResource() {
  const session = current();
  const agent = available.agents.find(item => item.id === (session?.agentId || $('#agent').value));
  const environment = available.environments.find(item => item.id === (session?.environmentId || $('#environment').value));
  const definitions = {
    agent: ['Agent definition', 'Reuse this definition across sessions. It selects the model, instructions and tools.', agent || {}],
    environment: ['Environment configuration', 'Reuse the sandbox configuration when creating sessions. Each hosted cloud session gets its own sandbox.', environment || {}],
    session: ['Selected session', 'This application stores the session reference, state and event projection.', session || {}],
    events: ['Selected event', 'An application projection with event identity, type, text and local receipt time. The source field identifies simulated, provider and application events.', selectedEvent || session?.events.at(-1) || {}],
  };
  const [heading, description, data] = definitions[resource];
  $('#inspector-heading').textContent = heading;
  $('#inspector-description').textContent = description;
  highlight('#json', JSON.stringify(data, null, 2), 'json');
  document.querySelectorAll('[data-resource]').forEach(node => node.classList.toggle('is-selected', node.dataset.resource === resource));
}
function render() {
  const session = current();
  const sameMode = sessions.filter(item => item.mode === mode);
  $('#demo-mode').classList.toggle('active', mode === 'demo');
  $('#live-mode').classList.toggle('active', mode === 'live');
  $('#demo-mode').setAttribute('aria-pressed', String(mode === 'demo'));
  $('#live-mode').setAttribute('aria-pressed', String(mode === 'live'));
  $('#mode-description').textContent = mode === 'demo' ? 'Local session simulation · scripted responses · no credentials needed' : 'Real hosted sessions · server credentials · provider usage charges apply';
  for (const id of ['agent', 'environment', 'create', 'demo-mode', 'live-mode', 'task-example', 'task', 'pace']) $(`#${id}`).disabled = busy;
  $('#create').disabled = busy || available.agents.length === 0 || available.environments.length === 0;
  $('#send').disabled = busy || !session || session.status !== 'idle';
  $('#inspect').disabled = busy || !session;
  $('#export').disabled = busy || !session;
  $('#stop').hidden = !busy || !session || session.status !== 'running';
  $('#session-status').textContent = session ? `${session.status}${session.stopReason ? ' · ' + session.stopReason : ''}` : 'No session';
  $('#session-status').dataset.state = session?.status || 'none';
  $('#map-status').textContent = session ? `Session ${session.status}` : 'Choose reusable resources';
  $('#agent-reference').textContent = session?.agentId || $('#agent').value || 'Choose an agent below';
  $('#environment-reference').textContent = session?.environmentId || $('#environment').value || 'Choose an environment below';
  $('#session-reference').textContent = session?.id || 'Create your first session';
  $('#event-reference').textContent = session?.events.at(-1)?.type || 'Waiting for a task';
  $('#session-meta').textContent = session ? `${session.mode === 'demo' ? 'Local demo' : 'Live provider'} · ${session.id}` : 'Create a session to connect the resources.';
  $('#session-count').textContent = sameMode.length;
  $('#sessions').innerHTML = sameMode.length ? [...sameMode].reverse().map((item, index) => `<button class="saved-session ${item.id === selectedId ? 'selected' : ''}" data-session="${escape(item.id)}" ${busy ? 'disabled' : ''}><strong>Session ${sameMode.length - index}</strong><span>${escape(item.id)}</span><small>${escape(item.status)} · ${item.events.filter(e => e.type === 'user.message').length} task(s)</small></button>`).join('') : '<p class="helper">Your sessions will appear here.</p>';
  const messages = session?.events.filter(item => item.type === 'user.message' || item.type === 'agent.message') || [];
  $('#conversation').innerHTML = messages.length ? messages.map(item => `<article class="message ${item.type === 'user.message' ? 'user-message' : 'agent-message'}"><strong>${item.type === 'user.message' ? 'Your task' : 'Agent response'}<span>${escape(item.source)}</span></strong><p>${escape(item.text || '')}</p></article>`).join('') : '<p class="empty-copy">Your selected session\'s messages appear here.</p>';
  const events = session?.events || [];
  $('#event-count').textContent = `${events.length} stored events`;
  $('#events').innerHTML = events.length ? events.map((item, index) => `<button class="event-row ${selectedEvent?.id === item.id ? 'selected' : ''}" data-event="${index}"><span class="event-index">${index + 1}</span><strong>${escape(item.type)}</strong><span class="event-source">${escape(item.source)}</span><small>${escape(item.id)}</small></button>`).join('') : '<p class="empty-copy">Create a session and send a task to inspect the event flow.</p>';
  const environment = available.environments.find(item => item.id === $('#environment').value);
  $('#resource-help').textContent = (environment?.description || 'Choose configured references for this lesson.') + ' Selections apply to new sessions.';
  highlight('#typescript', config.snippets[codeTab], 'typescript');
  document.querySelectorAll('[data-code]').forEach(button => {
    button.classList.toggle('active', button.dataset.code === codeTab);
    button.setAttribute('aria-pressed', String(button.dataset.code === codeTab));
  });
  inspectResource();
}
async function perform(operation) {
  if (busy) return;
  busy = true;
  notice('');
  render();
  try { await operation(); } catch (error) { notice(error.message); }
  finally { busy = false; render(); }
}
async function selectMode(next) {
  mode = next;
  selectedEvent = null;
  selectedId = sessions.findLast(item => item.mode === mode)?.id || null;
  available = { agents: [], environments: [] };
  $('#agent').innerHTML = '';
  $('#environment').innerHTML = '';
  render();
  available = await request(`/api/resources?mode=${mode}`);
  $('#agent').innerHTML = available.agents.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('');
  $('#environment').innerHTML = available.environments.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('');
  if (current()) { $('#agent').value = current().agentId; $('#environment').value = current().environmentId; }
}
async function sendTask() {
  const id = selectedId;
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: $('#task').value, pace: $('#pace').value }) });
  if (!response.ok) throw new Error((await response.json()).error);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let completed = false;
  let error = '';
  const consume = line => {
    if (!line.trim()) return;
    const value = JSON.parse(line);
    if (value.session) { update(value.session); selectedEvent = null; render(); }
    if (value.kind === 'complete') completed = true;
    if (value.kind === 'error') error = value.error;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      lines.forEach(consume);
      if (done) { if (pending.trim()) consume(pending); break; }
    }
  } finally { reader.releaseLock(); }
  if (error) throw new Error(error);
  if (!completed) throw new Error('The connection ended early. Refresh the retained session history.');
}

async function initialize() {
  config = await request('/api/config');
  sessions = await request('/api/sessions');
  $('#task-example').innerHTML = config.tasks.map((task, index) => `<option value="${index}">${escape(task)}</option>`).join('');
  $('#task').value = config.tasks[0];
  $('#task-example').onchange = () => { $('#task').value = config.tasks[Number($('#task-example').value)]; };
  $('#agent').onchange = $('#environment').onchange = () => { resource = 'agent'; render(); };
  for (const next of ['demo', 'live']) $(`#${next}-mode`).onclick = () => perform(() => selectMode(next));
  $('#create').onclick = () => perform(async () => {
    const session = await request('/api/sessions', { method: 'POST', body: JSON.stringify({ mode, agentId: $('#agent').value, environmentId: $('#environment').value }) });
    update(session);
    selectedId = session.id;
    selectedEvent = null;
    resource = 'session';
  });
  $('#send').onclick = () => perform(sendTask);
  $('#stop').onclick = async () => {
    try { await request(`/api/sessions/${encodeURIComponent(selectedId)}/stop`, { method: 'POST', body: '{}' }); }
    catch (error) { notice(error.message); }
  };
  $('#inspect').onclick = () => perform(async () => {
    update(await request(`/api/sessions/${encodeURIComponent(selectedId)}/inspect`, { method: 'POST', body: '{}' }));
    selectedEvent = null;
    notice(mode === 'demo' ? 'Local stored history refreshed.' : 'Provider session and paginated event history refreshed.');
  });
  $('#sessions').onclick = event => {
    const button = event.target.closest('[data-session]');
    if (!button || busy) return;
    selectedId = button.dataset.session;
    selectedEvent = null;
    resource = 'session';
    $('#agent').value = current().agentId;
    $('#environment').value = current().environmentId;
    render();
  };
  $('#events').onclick = event => {
    const button = event.target.closest('[data-event]');
    if (!button) return;
    selectedEvent = current().events[Number(button.dataset.event)];
    resource = 'events';
    render();
  };
  document.querySelectorAll('[data-resource]').forEach(button => button.onclick = () => {
    resource = button.dataset.resource;
    selectedEvent = null;
    inspectResource();
    $('#source-code').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelectorAll('[data-code]').forEach(button => button.onclick = () => { codeTab = button.dataset.code; render(); });
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(current(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'prompt-02-session.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('#present').onclick = () => {
    const value = document.body.classList.toggle('presentation');
    $('#present').setAttribute('aria-pressed', String(value));
    $('#present').textContent = value ? 'Exit presentation' : 'Presentation view';
  };
  if (new URLSearchParams(location.search).has('presentation')) $('#present').click();
  await perform(() => selectMode('demo'));
}
initialize().catch(error => { notice(error.message); $('#create').disabled = true; $('#send').disabled = true; });
