// Page wiring: form, deep link, state machine. Rendering is in render.js, pure logic in view-model.js.
// Rule: a scan only starts on a click (or Enter in the form). ?repo= fills the field and nothing more.
import { renderReport, renderState } from './render.js';
import { parseRepoInput, deepLinkRepo, errorState, loadingText, formatScanTime, STATES, DEMO_REPO } from './view-model.js';
import { fixtureName, loadFixture } from './fixture-mode.js';
import { initTabs } from './tabs.js';
import { bindDisclosure } from './disclosure.js';
import { SITE_URL, deepLink } from './site.js';

const CLIENT_TIMEOUT_MS = 70000; // the function allows 60 s
const form = document.getElementById('scan-form');
const input = document.getElementById('repo-input');
const button = document.getElementById('scan-btn');
const stamp = document.getElementById('scan-time');
const out = document.getElementById('out');
let busy = false;

function setBusy(on) {
  busy = on;
  button.disabled = on;
  button.textContent = on ? 'SCANNING' : 'SCAN';
}

function looksLikeReport(r) {
  return r && typeof r === 'object' && r.counts && Array.isArray(r.findings) && r.repo && typeof r.mood === 'string';
}

function show(report) {
  renderReport(report, out);
  stamp.textContent = formatScanTime(report.receipt?.scannedAt ?? new Date());
}

async function scan(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: url }),
      signal: ctl.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) { renderState(out, errorState(res.status, body?.error?.code), 'error'); return; }
    if (!looksLikeReport(body)) { renderState(out, STATES.failed, 'error'); return; }
    show(body);
  } catch {
    renderState(out, STATES.failed, 'error'); // network failure or timeout
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const p = parseRepoInput(input.value);
  input.setAttribute('aria-invalid', String(!p.ok));
  if (!p.ok) { renderState(out, STATES.badInput, 'error'); input.focus(); return; }
  input.value = p.url;
  setBusy(true);
  renderState(out, loadingText(p.owner, p.name), 'loading', true);
  await scan(p.url);
  setBusy(false);
});

// Tabs, the HOW? toggle, and the clean public address in the ABOUT tab. None of these starts a scan.
function initChrome() {
  initTabs();
  bindDisclosure(document.getElementById('how-btn'), document.getElementById('how-panel'), { open: false });
  const live = document.getElementById('live-url');
  live.href = SITE_URL;
  live.textContent = SITE_URL;
  document.getElementById('deep-example').textContent = deepLink('owner/name');
}

async function init() {
  initChrome();
  input.value = deepLinkRepo(location.search) ?? DEMO_REPO;
  const fx = fixtureName(location.search, location.hostname);
  if (fx) {
    try { show(await loadFixture(fx)); } catch { renderState(out, STATES.failed, 'error'); }
    return;
  }
  renderState(out, STATES.idle, 'idle');
}

init();
