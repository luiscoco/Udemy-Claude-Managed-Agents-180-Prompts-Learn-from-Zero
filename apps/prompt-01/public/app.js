const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let config;
let report = '';
let mode = 'demo';
let tab = 'analysis';
let editing = false;
let batch = false;
let batchStopped = false;
let results = {};
const controllers = new Map();
const emptyResult = () => ({ status: 'ready', steps: [], analysis: null, sessionId: null, error: '', mode: null });

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
}

try {
  applyTheme(localStorage.getItem('prompt-01-theme'));
} catch {
  applyTheme('light');
}
$('#theme-toggle').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('prompt-01-theme', theme); } catch { /* Theme still works when storage is unavailable. */ }
};

function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
}
function resetResults() {
  results = Object.fromEntries(config.products.map(p => [p.id, emptyResult()]));
  renderDocument();
  render();
}
function renderDocument(quote = '') {
  const target = $('#document');
  if (quote && report.includes(quote)) {
    const start = report.indexOf(quote);
    target.innerHTML = escape(report.slice(0, start)) + '<mark tabindex="-1">' + escape(quote) + '</mark>' + escape(report.slice(start + quote.length));
    target.querySelector('mark').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    target.querySelector('mark').focus({ preventScroll: true });
  } else target.textContent = report;
  $('#char-count').textContent = `${report.length.toLocaleString()} characters`;
}
function analysisMarkup(product, state) {
  if (!state.analysis) return `<div class="empty-state"><div class="empty-symbol">${state.status === 'running' ? '<span class="loader"></span>' : '↗'}</div><strong>${state.status === 'running' ? 'Following the work…' : 'Ready to analyze'}</strong><p>${state.status === 'running' ? escape(state.steps.at(-1)?.name || 'Starting the run') : 'Run this approach to explore findings and their supporting passages.'}</p></div>`;
  let sourceIndex = 0;
  const section = (title, items, risk) => `<section class="analysis-section ${risk ? 'risks' : ''}"><h4>${title} <span>${items.length}</span></h4>${items.length ? items.map(item => {
    const index = sourceIndex++;
    return `<div class="finding"><span class="finding-dot"></span><p>${escape(item.text)}</p><button class="source-ref" data-product="${product.id}" data-source="${index}" aria-label="Inspect source ${index + 1} for ${product.name}">[${index + 1}]</button></div>`;
  }).join('') : '<p class="muted">No risk passages identified.</p>'}</section>`;
  return section('Findings', state.analysis.findings, false) + section('Risks to review', state.analysis.risks, true);
}
function executionMarkup(state) {
  return `<p class="trace-mode">${state.mode === 'live' ? 'Actual adapter events' : 'Illustrative product flow · local demo'}</p>${state.steps.length ? `<ol class="timeline">${state.steps.map(step => `<li><span class="timeline-dot"></span><span class="owner">${escape(step.owner)}</span><h4>${escape(step.name)}</h4><p>${escape(step.detail)}</p></li>`).join('')}</ol>` : '<div class="empty-state"><strong>Your execution trace appears here</strong><p>Follow which parts run in your application and which belong to the selected product.</p></div>'}`;
}

function codeMarkup(product) {
  const highlighted = Prism.highlight(config.snippets[product.id], Prism.languages.typescript, 'typescript');
  return `<p class="code-caption">TypeScript · Live adapter excerpt<br>${escape(product.package)}</p>
    <pre class="language-typescript" tabindex="0" aria-label="${escape(product.name)} TypeScript example"><code class="language-typescript">${highlighted}</code></pre>
    <p class="muted">Complete runnable implementation in src/adapters.ts.</p>`;
}

function render() {
  const busy = controllers.size > 0 || batch;
  $('#demo-mode').classList.toggle('active', mode === 'demo');
  $('#live-mode').classList.toggle('active', mode === 'live');
  $('#demo-mode').setAttribute('aria-pressed', String(mode === 'demo'));
  $('#live-mode').setAttribute('aria-pressed', String(mode === 'live'));
  $('#mode-description').textContent = mode === 'demo'
    ? 'Local extraction · simulated product flows · no credentials needed'
    : 'Real Claude calls · server credentials · usage charges apply';
  const available = config.products.filter(p => mode === 'demo' || config.readiness[p.id].ready);
  $('#run-all').disabled = busy || editing || available.length === 0;
  $('#run-all').textContent = mode === 'live' && available.length < 3 ? `▶ Run ${available.length} configured` : '▶ Run all three';
  for (const id of ['demo-mode', 'live-mode', 'pace', 'reset', 'sample', 'upload', 'edit-document']) $(`#${id}`).disabled = busy;
  $('#stop').hidden = !busy;
  $('#pace').disabled = busy || mode === 'live';
  $('#download').disabled = busy || !Object.values(results).some(r => r.analysis);
  $('#products').innerHTML = config.products.map(product => {
    const state = results[product.id];
    const ready = mode === 'demo' || config.readiness[product.id].ready;
    const status = state.status === 'complete' ? 'Complete' : state.status === 'running' ? 'Running' : state.status === 'error' ? 'Needs attention' : ready ? 'Ready' : 'Setup required';
    return `<article class="product-card ${product.accent}" data-testid="product-${product.id}">
      <div class="product-heading"><span class="product-symbol">${product.id === 'managed' ? '◈' : product.id === 'sdk' ? '⌘' : '↔'}</span><span class="run-status ${state.status}"><i></i>${status}</span></div>
      <h3>${escape(product.name)}${product.id === 'managed' ? '<span class="beta">BETA</span>' : ''}</h3>
      <p class="product-description">${escape(product.description)}</p>
      <div class="flow">${product.path.map((part, index) => `${index ? '<span class="flow-arrow">→</span>' : ''}<span>${escape(part)}</span>`).join('')}</div>
      <div class="loop-owner"><span>AGENT LOOP</span><strong>${escape(product.loop)}</strong></div>
      <div class="result-content" data-testid="content-${product.id}">${tab === 'analysis' ? analysisMarkup(product, state) : tab === 'execution' ? executionMarkup(state) : codeMarkup(product)}</div>
      ${state.error ? `<p class="run-error" role="alert">${escape(state.error)}</p>` : ''}
      ${!ready ? `<div class="setup-note"><strong>Server setup</strong><p>${config.readiness[product.id].needs.map(escape).join('<br>')}</p><span>See .env.example and README.md</span></div>` : ''}
      ${state.sessionId ? `<div class="session-reference">Hosted session <code>${escape(state.sessionId)}</code></div>` : ''}
      <div class="product-foot"><span>${state.status === 'complete' ? `${state.mode === 'demo' ? 'Demo' : 'Live'} · ${(state.durationMs / 1000).toFixed(1)}s` : mode === 'demo' ? 'Local classroom demo' : 'Live product adapter'}</span><button class="run-one" data-run="${product.id}" ${busy || editing || !ready ? 'disabled' : ''}>${state.analysis ? 'Run again' : 'Run analysis'} <span>↗</span></button></div>
    </article>`;
  }).join('');
}

async function runProduct(product) {
  const controller = new AbortController();
  controllers.set(product, controller);
  const state = results[product] = { ...emptyResult(), status: 'running', mode };
  render();
  try {
    const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, mode, report, pace: $('#pace').value }), signal: controller.signal });
    if (!response.ok) throw new Error((await response.json()).error || 'Unable to start the run.');
    if (!response.body) throw new Error('Streaming is unavailable in this browser.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const applyEvent = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.kind === 'step') state.steps.push(event);
      if (event.kind === 'session') state.sessionId = event.id;
      if (event.kind === 'result') Object.assign(state, event, { status: 'complete' });
      if (event.kind === 'error') { state.status = 'error'; state.error = event.message; }
      if (event.kind !== 'ping') render();
    };
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      lines.forEach(applyEvent);
      if (done) { if (pending.trim()) applyEvent(pending); break; }
    }
    if (state.status === 'running') throw new Error('The connection ended before the result arrived.');
  } catch (error) {
    state.status = 'error';
    state.error = error.name === 'AbortError' ? 'Stopped. Inspect any hosted session shown here before restarting.' : error.message;
  } finally {
    controllers.delete(product);
    render();
  }
}

async function initialize() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Unable to load lesson configuration. Restart the server and refresh.');
  config = await response.json();
  report = config.sampleReport;
  $('#ownership-rows').innerHTML = [['Agent loop', 'loop'], ['Runtime hosting', 'hosting'], ['Conversation state', 'state'], ['Choose when', 'fit']]
    .map(([label, key]) => `<tr><th scope="row">${label}</th>${config.products.map(p => `<td>${escape(p[key])}</td>`).join('')}</tr>`).join('');
  $('#sources').innerHTML = config.products.map(p => `<a href="${p.source}" target="_blank" rel="noreferrer">${escape(p.name)} docs ↗</a>`).join('');
  $('#products').addEventListener('click', event => {
    const run = event.target.closest('[data-run]');
    if (run && !run.disabled) { notice(''); void runProduct(run.dataset.run); }
    const source = event.target.closest('[data-source]');
    if (source) {
      const result = results[source.dataset.product].analysis;
      renderDocument([...result.findings, ...result.risks][Number(source.dataset.source)].quote);
    }
  });
  $('.tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    render();
  });
  for (const nextMode of ['demo', 'live']) $(`#${nextMode}-mode`).onclick = () => {
    mode = nextMode;
    notice(mode === 'live' ? 'Live runs send this document to Claude. Configure server-side credentials in .env and restart the app to enable each adapter.' : '');
    resetResults();
  };
  $('#run-all').onclick = async () => {
    batch = true;
    batchStopped = false;
    notice('');
    render();
    try {
      for (const p of config.products) {
        if (batchStopped) break;
        if (mode === 'demo' || config.readiness[p.id].ready) await runProduct(p.id);
      }
    } finally { batch = false; render(); }
  };
  $('#stop').onclick = () => { batchStopped = true; controllers.forEach(c => c.abort()); };
  $('#reset').onclick = () => { notice(''); resetResults(); };
  $('#sample').onclick = () => { report = config.sampleReport; editing = false; $('#editor').hidden = true; $('#document').hidden = false; $('#edit-document').textContent = 'Edit document'; notice(''); resetResults(); };
  $('#edit-document').onclick = () => {
    if (editing) {
      const value = $('#editor').value.trim();
      if (value.length < 40 || value.length > 30000) return notice('Use a document between 40 and 30,000 characters.');
      report = value;
      editing = false;
      $('#editor').hidden = true;
      $('#document').hidden = false;
      $('#edit-document').textContent = 'Edit document';
      notice('');
      resetResults();
    } else {
      editing = true;
      $('#editor').value = report;
      $('#editor').hidden = false;
      $('#document').hidden = true;
      $('#edit-document').textContent = 'Save document';
      $('#editor').focus();
      render();
    }
  };
  $('#upload').onchange = async event => {
    const file = event.target.files[0];
    try {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.txt') || file.size > 128000) throw new Error('Choose a UTF-8 .txt file smaller than 128 KB.');
      const text = (await file.text()).trim();
      if (text.length < 40 || text.length > 30000) throw new Error('Use a document between 40 and 30,000 characters.');
      report = text;
      editing = false;
      $('#editor').hidden = true;
      $('#document').hidden = false;
      $('#edit-document').textContent = 'Edit document';
      notice('');
      resetResults();
    } catch (error) { notice(error.message); }
    finally { event.target.value = ''; }
  };
  $('#present').onclick = () => {
    const value = document.body.classList.toggle('presentation');
    $('#present').setAttribute('aria-pressed', String(value));
    $('#present').textContent = value ? '▣ Exit presentation' : '▣ Presentation view';
  };
  if (new URLSearchParams(location.search).has('presentation')) $('#present').click();
  $('#download').onclick = () => {
    const blob = new Blob([JSON.stringify({ lesson: 1, document: report, results }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'prompt-01-lesson-results.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  resetResults();
}
initialize().catch(error => { notice(error.message); $('#run-all').disabled = true; });
