const $ = selector => document.querySelector(selector);
const number = Number(location.pathname.match(/\/lesson\/(\d+)/)?.[1] || 56);
let lesson, state, step = 0, busy = false;
function highlight(node, text, language = 'json') { node.className = `language-${language}`; node.textContent = text; Prism.highlightElement(node); }
async function api(suffix = '', data) {
    const response = await fetch(`/api/lesson/${number}${suffix}`, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.error);
    return result;
}
function render() {
    $('#status').textContent = `${state.status} · revision ${state.revision}`;
    $('#status').className = state.status;
    highlight($('#result'), JSON.stringify(state.result, null, 2));
    highlight($('#state'), JSON.stringify({ resources: state.resources, files: state.files }, null, 2));
    $('#metrics').textContent = Object.keys(state.metrics).length ? JSON.stringify(state.metrics) : 'Each operation saves evidence and a revision in this browser’s lesson state.';
    $('#events').replaceChildren(...state.events.map(event => { const li = document.createElement('li'); li.className = event.status; const strong = document.createElement('strong'); strong.textContent = `${event.sequence}. ${event.label}`; const small = document.createElement('small'); small.textContent = `${event.status} · ${event.summary}`; li.append(strong, small); return li; }));
    $('#downloads').replaceChildren(...state.artifacts.map(item => { const link = document.createElement('a'); link.textContent = `Download ${item.name}`; link.href = `/api/lesson/${number}/download?name=${encodeURIComponent(item.name)}`; link.download = item.name; return link; }));
    $('#step').textContent = `${Math.min(step, lesson.walkthrough.length)} / ${lesson.walkthrough.length} steps`;
    $('#next').disabled = busy || step >= lesson.walkthrough.length;
}
function values() { return Object.fromEntries(lesson.fields.map(field => { const input = document.getElementById(`field-${field.key}`); return [field.key, typeof field.value === 'boolean' ? input.checked : typeof field.value === 'number' ? Number(input.value) : input.value]; })); }
async function run(action, overrides, guided = false) {
    if (busy)
        return;
    busy = true;
    $('#error').textContent = '';
    document.querySelectorAll('button[data-action]').forEach(button => button.disabled = true);
    $('#next').disabled = true;
    try {
        if (overrides)
            for (const [key, value] of Object.entries(overrides)) {
                const input = document.getElementById(`field-${key}`);
                if (input) {
                    if (typeof value === 'boolean')
                        input.checked = value;
                    else
                        input.value = value;
                }
            }
        state = (await api('/action', { action, revision: state.revision, input: values() })).state;
        if (guided)
            step++;
    }
    catch (error) {
        $('#error').textContent = error.message;
    }
    finally {
        busy = false;
        document.querySelectorAll('button[data-action]').forEach(button => button.disabled = false);
        render();
    }
}
async function start() {
    ({ lesson, state } = await api());
    document.title = `Prompt ${number} · ${lesson.title}`;
    $('#title').textContent = `Prompt ${number} · ${lesson.title}`;
    $('#prompt').textContent = lesson.takeaway;
    $('#original').textContent = lesson.prompt;
    for (const field of lesson.fields) {
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = document.createElement(field.options ? 'select' : 'input');
        input.id = `field-${field.key}`;
        if (field.options)
            for (const value of field.options) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                input.append(option);
            }
        else
            input.type = typeof field.value === 'boolean' ? 'checkbox' : typeof field.value === 'number' ? 'number' : 'text';
        if (typeof field.value === 'boolean')
            input.checked = field.value;
        else
            input.value = field.value;
        label.append(input);
        $('#fields').append(label);
    }
    for (const action of lesson.actions) {
        const button = document.createElement('button');
        button.dataset.action = action.id;
        button.textContent = action.label;
        button.onclick = () => run(action.id);
        $('#actions').append(button);
    }
    for (const example of lesson.examples) {
        const label = document.createElement('p');
        label.className = 'snippet-label';
        label.textContent = `${example.label} · ${example.language}`;
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        pre.append(code);
        $('#examples').append(label, pre);
        highlight(code, example.code, example.language);
    }
    for (const source of lesson.sources) {
        const link = document.createElement('a');
        link.href = source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.replace('https://', '');
        $('#sources').append(link);
    }
    $('#next').onclick = () => { const current = lesson.walkthrough[step]; if (current)
        run(current.action, current.input, true); };
    $('#reset').onclick = async () => { if (busy)
        return; busy = true; $('#next').disabled = true; try {
        state = (await api('/reset', {})).state;
        step = 0;
        $('#error').textContent = '';
    }
    catch (error) {
        $('#error').textContent = error.message;
    }
    finally {
        busy = false;
        render();
    } };
    render();
    document.body.dataset.ready = 'true';
}
function theme() { const dark = document.body.classList.contains('dark'); $('#theme').textContent = dark ? 'Light theme' : 'Dark theme'; }
document.body.classList.toggle('dark', localStorage.getItem('course-theme') === 'dark');
theme();
$('#theme').onclick = () => { document.body.classList.toggle('dark'); localStorage.setItem('course-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); theme(); };
document.body.classList.toggle('presentation', new URLSearchParams(location.search).has('presentation'));
$('#presentation').onclick = () => document.body.classList.toggle('presentation');
start().catch(error => $('#error').textContent = error.message);
