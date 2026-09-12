import { drawSample, sampleFile, sampleVideo } from './media.js';

const select = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icons = () => window.lucide?.createIcons();
const integer = (value) => new Intl.NumberFormat('en-US').format(value);
const money = (value) => `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(6)}`;
const modelLabel = (value) => value === 'demo-small' ? 'Demo Small' : 'Demo Large';
const state = { sessionId: crypto.randomUUID(), sessionNumber: 1, runs: [], files: [], video: null, scenario: 'normal', busy: false, selected: -1 };
const welcome = select('#messages').innerHTML;

function status(text) { select('#requestStatus').textContent = text; }
function error(message) { select('#error').textContent = message; select('#error').hidden = !message; }
function setBusy(value) {
  state.busy = value;
  ['#sendButton', '#attachButton', '#newSession', '#clearCache', '#prompt', '#preserveDetail'].forEach((selector) => { select(selector).disabled = value; });
  document.querySelectorAll('[data-replay], [data-remove], [data-example], #sampleImage').forEach((button) => { button.disabled = value; });
}

function updateMetrics() {
  const sum = (key) => state.runs.reduce((total, run) => total + run.result[key], 0);
  const baseline = sum('baselineCost');
  const hits = state.runs.filter((run) => run.result.cache === 'hit').length;
  select('#savingsPercent').innerHTML = `${baseline ? (100 * sum('savings') / baseline).toFixed(1) : '0.0'}<span>%</span>`;
  select('#savingsValue').textContent = `${money(sum('savings'))} vs. estimated baseline`;
  select('#totalTokens').textContent = integer(sum('totalTokens'));
  select('#totalCost').textContent = money(sum('cost'));
  select('#cacheRate').innerHTML = `${state.runs.length ? Math.round(100 * hits / state.runs.length) : 0}<span>%</span>`;
  select('#cacheCount').textContent = `${hits} hits across ${state.runs.length} requests`;
  select('#runCount').textContent = state.runs.length;
  select('#ledgerRows').innerHTML = state.runs.length ? state.runs.map((run, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${modelLabel(run.result.model)}</td><td><span class="tag ${run.result.cache === 'hit' ? 'green' : ''}">${run.result.cache}</span></td><td>${integer(run.result.inputTokens)}</td><td>${integer(run.result.outputTokens)}</td><td>${money(run.result.cost)}</td><td>${money(run.result.savings)}</td></tr>`).join('') : '<tr><td colspan="7" class="subtle">No requests in this session.</td></tr>';
}

function renderAttachments() {
  select('#attachments').innerHTML = state.files.map((file, index) => `<div class="attachment-chip"><i data-lucide="${file.type.startsWith('image/') ? 'image' : 'file-text'}"></i><span>${escape(file.name)}</span><button type="button" data-remove="${index}" title="Remove ${escape(file.name)}" aria-label="Remove ${escape(file.name)}"><i data-lucide="x"></i></button></div>`).join('') + (state.video ? `<p class="warning">${escape(state.video.name)}: ${state.files.length} sampled frames. No audio; brief events may be missed.</p>` : '');
  icons();
}

function renderMessages() {
  if (!state.runs.length) {
    select('#messages').innerHTML = welcome;
    drawSample(select('#sampleCanvas'));
    icons();
    return;
  }
  select('#messages').innerHTML = state.runs.map((run, index) => `<article class="message user-message"><div class="message-label"><i data-lucide="user-round"></i>You ${run.replayed ? '<span class="tag">EXACT REPLAY</span>' : ''}</div><div class="message-text">${escape(run.request.prompt)}</div>${run.files.length ? `<div class="message-files">${run.files.map((file) => `<span>${escape(file.name)}</span>`).join(' / ')}</div>` : ''}</article><article class="message assistant-message"><div class="message-label"><i data-lucide="layers-2"></i>TokenWise<span class="tag ${run.result.cache === 'hit' ? 'green' : ''}">${run.result.cache === 'hit' ? 'CACHE HIT' : modelLabel(run.result.model)}</span></div><div class="message-text">${escape(run.result.answer)}</div><div class="message-actions"><span>${integer(run.result.totalTokens)} est. tokens</span><span>/</span><span>${money(run.result.cost)} simulated</span><span>/</span><span>${run.result.latencyMs} ms server</span><button class="icon-button" data-inspect="${index}" title="Inspect request ${index + 1}" aria-label="Inspect request ${index + 1}"><i data-lucide="scan-line"></i></button><button class="icon-button" data-replay="${index}" title="Replay exact request (same context and files)" aria-label="Replay exact request ${index + 1}"><i data-lucide="repeat-2"></i></button><button class="icon-button" data-copy="${index}" title="Copy response" aria-label="Copy response ${index + 1}"><i data-lucide="copy"></i></button></div></article>`).join('');
  icons();
  select('#messages').scrollTop = select('#messages').scrollHeight;
}

function inspect(index) {
  state.selected = index;
  const result = state.runs[index].result;
  const optimized = result.cache === 'hit' ? 0 : result.optimizedInputTokens;
  const maximum = Math.max(result.originalInputTokens, optimized, 1);
  select('#inspectorContent').innerHTML = `<div class="inspector-model"><strong>${modelLabel(result.model)}</strong><span class="tag ${result.cache === 'hit' ? 'green' : 'orange'}">${result.cache === 'hit' ? 'CACHED ANSWER' : 'SIMULATED'}</span></div><p class="inspector-caption">Run ${String(index + 1).padStart(2, '0')} / ${result.attempts.length} inference attempt(s)<br>Quality: not evaluated</p><section class="inspector-block"><h3>Input payload estimate</h3><div class="bar-row"><span>Original</span><meter min="0" max="${maximum}" value="${result.originalInputTokens}" aria-label="Original input estimate"></meter><span>${integer(result.originalInputTokens)}</span></div><div class="bar-row optimized"><span>Sent</span><meter min="0" max="${maximum}" value="${optimized}" aria-label="Final input estimate"></meter><span>${integer(optimized)}</span></div><dl class="breakdown">${Object.entries(result.breakdown).map(([key, value]) => `<div><dt>${escape(key[0].toUpperCase() + key.slice(1))}</dt><dd>${integer(value)}</dd></div>`).join('')}<div><dt>All-attempt input</dt><dd>${integer(result.inputTokens)}</dd></div><div><dt>All-attempt output</dt><dd>${integer(result.outputTokens)}</dd></div></dl><p class="warning">Illustrative units, not provider-reported tokens.${result.cache === 'hit' ? ' Breakdown describes the cached payload; no new inference.' : ''}</p></section>${result.evidence.length ? `<section class="inspector-block"><h3>Media & evidence</h3>${result.evidence.map((item) => `<div class="media-evidence">${item.preview ? `<img src="${item.preview}" alt="Optimized preview of ${escape(item.name)}">` : ''}<strong>${escape(item.name)}</strong><p>${escape(item.action)}${item.width ? `<br>${item.originalWidth} x ${item.originalHeight} &rarr; ${item.width} x ${item.height}` : ''}<br>${integer(item.originalBytes)} &rarr; ${integer(item.optimizedBytes)} bytes<br>${integer(item.originalUnits)} &rarr; ${integer(item.optimizedUnits)} illustrative input units</p>${item.artifactHit ? '<span class="tag green">ARTIFACT REUSED</span>' : ''}<p class="warning">${escape(item.omitted)}</p></div>`).join('')}${result.video ? `<p class="warning">${result.video.timestamps.length} frames sampled from ${result.video.duration.toFixed(1)}s. Audio excluded. Savings baseline is sampled frames, not full video.</p>` : ''}</section>` : ''}<section class="inspector-block"><h3>Decision trail</h3><ol class="timeline">${result.events.map((event) => `<li><strong>${escape(event.stage)}</strong><p>${escape(event.detail)}</p></li>`).join('')}</ol></section>${result.attempts.length ? `<section class="inspector-block"><h3>Attempt ledger</h3><dl class="breakdown">${result.attempts.map((attempt) => `<div><dt>${modelLabel(attempt.model)}${attempt.valid ? '' : ' (failed)'}</dt><dd>${money(attempt.cost)}</dd></div>`).join('')}</dl></section>` : ''}`;
  icons();
}

async function send(replayIndex = null) {
  if (state.busy) return;
  const previous = replayIndex !== null ? state.runs[replayIndex] : null;
  const prompt = select('#prompt').value.trim();
  if (!previous && !prompt) return;
  const history = state.runs.filter((run) => !run.replayed).flatMap((run) => [{ role: 'user', content: run.request.prompt }, { role: 'assistant', content: run.result.answer }]);
  if (!previous && history.length > 40) { error('This demo supports 20 conversation turns. Export the ledger and start a new conversation.'); return; }
  const request = previous ? previous.request : { sessionId: state.sessionId, prompt, history, scenario: state.scenario, preserveDetail: select('#preserveDetail').checked, video: state.video };
  const files = previous ? previous.files : [...state.files];
  const form = new FormData();
  form.append('request', JSON.stringify(request));
  files.forEach((file) => form.append('files', file));
  error('');
  setBusy(true);
  status('Optimizing and routing...');
  try {
    const response = await fetch('/api/chat', { method: 'POST', body: form, signal: AbortSignal.timeout(45000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    state.runs.push({ request, files, result, replayed: Boolean(previous) });
    if (!previous) { select('#prompt').value = ''; state.files = []; state.video = null; state.scenario = 'normal'; renderAttachments(); }
    renderMessages();
    updateMetrics();
    inspect(state.runs.length - 1);
    status(result.cache === 'hit' ? 'Exact cache hit / no inference' : 'Complete / simulated inference');
  } catch (failure) { error(failure.name === 'TimeoutError' ? 'Request timed out. Try fewer or smaller attachments.' : failure.message); status('Request failed'); }
  finally { setBusy(false); }
}

select('#chatForm').addEventListener('submit', (event) => { event.preventDefault(); void send(); });
select('#attachButton').addEventListener('click', () => select('#fileInput').click());
select('#fileInput').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length || state.busy) return;
  error('');
  setBusy(true);
  try {
    const video = files.find((file) => file.type.startsWith('video/') || /\.(mp4|webm)$/i.test(file.name));
    if (video) {
      if (files.length !== 1 || state.files.length) throw new Error('Attach a video by itself; remove existing attachments first.');
      const sampled = await sampleVideo(video, status);
      state.files = sampled.files;
      state.video = sampled.video;
      status('Video sampled / audio excluded');
    } else {
      if (state.video) throw new Error('Remove the video frames before attaching other files.');
      if (state.files.length + files.length > 6) throw new Error('Attach up to six files.');
      if (files.some((file) => file.size > 8 * 1024 * 1024)) throw new Error('Each image or text file must be under 8 MB.');
      if (files.some((file) => !/\.(txt|md|png|jpe?g|webp)$/i.test(file.name))) throw new Error('Supported files: TXT, MD, JPEG, PNG, WebP, MP4, and WebM.');
      state.files.push(...files);
      status('Files attached');
    }
    renderAttachments();
  } catch (failure) { error(failure.message); status('Attachment failed'); }
  finally { setBusy(false); }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || state.busy) return;
  if (button.dataset.example) {
    const prompts = { tokens: 'Explain how tokens affect the cost of an AI conversation.', cache: 'Compare exact response caching and provider prompt caching.', recovery: 'Compare exact response caching and provider prompt caching.' };
    state.scenario = button.dataset.example === 'recovery' ? 'recovery' : 'normal';
    select('#prompt').value = prompts[button.dataset.example];
    status(state.scenario === 'recovery' ? 'Recovery scenario / scripted first-attempt failure' : 'Ready');
    select('#prompt').focus();
  }
  if (button.id === 'sampleImage') {
    try {
      state.files = [await sampleFile(select('#sampleCanvas'))]; state.video = null;
      select('#prompt').value = 'Summarize this operations report image.';
      state.scenario = 'normal';
      renderAttachments();
      select('#prompt').focus();
    } catch (failure) { error(failure.message); }
  }
  if (button.dataset.remove !== undefined) {
    if (state.video) { state.files = []; state.video = null; } else state.files.splice(Number(button.dataset.remove), 1);
    renderAttachments();
  }
  if (button.dataset.replay !== undefined) void send(Number(button.dataset.replay));
  if (button.dataset.inspect !== undefined) inspect(Number(button.dataset.inspect));
  if (button.dataset.copy !== undefined) {
    try { await navigator.clipboard.writeText(state.runs[Number(button.dataset.copy)].result.answer); status('Response copied'); }
    catch { error('Clipboard access is unavailable in this browser.'); }
  }
});

select('#prompt').addEventListener('input', () => { state.scenario = 'normal'; });
select('#newSession').addEventListener('click', () => {
  state.sessionId = crypto.randomUUID(); state.sessionNumber += 1; state.runs = []; state.files = []; state.video = null; state.scenario = 'normal'; state.selected = -1;
  select('#sessionLabel').textContent = `Session ${String(state.sessionNumber).padStart(2, '0')}`;
  select('#prompt').value = ''; select('#preserveDetail').checked = false;
  select('#inspectorContent').innerHTML = '<div class="inspector-empty"><i data-lucide="route"></i><h3>No request selected</h3><span class="subtle">Awaiting first run</span></div>';
  error(''); status('Ready'); renderMessages(); renderAttachments(); updateMetrics(); showView('chat');
});
select('#clearCache').addEventListener('click', async () => {
  try {
    const response = await fetch(`/api/cache/${state.sessionId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not clear cache.');
    status('Session response cache cleared');
  } catch (failure) { error(failure.message); }
});
select('#exportSession').addEventListener('click', () => {
  const exportData = { version: 1, mode: 'demo', sessionId: state.sessionId, exportedAt: new Date().toISOString(), notes: 'Usage and costs simulated. Quality not evaluated. Includes prompts and responses; share carefully.', runs: state.runs.map(({ request, result, replayed }) => ({ request, result, replayed })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokenwise-session-${state.sessionNumber}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Session ledger exported');
});
function showView(view) {
  select('#chatView').hidden = view !== 'chat'; select('#ledgerView').hidden = view !== 'ledger';
  ['chat', 'ledger'].forEach((name) => { select(`#${name}Tab`).classList.toggle('active', view === name); select(`#${name}Tab`).setAttribute('aria-pressed', String(view === name)); });
}
select('#chatTab').addEventListener('click', () => showView('chat'));
select('#ledgerTab').addEventListener('click', () => showView('ledger'));
drawSample(select('#sampleCanvas'));
updateMetrics();
icons();