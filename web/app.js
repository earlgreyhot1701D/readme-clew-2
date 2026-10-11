// Page wiring: form, deep link, and the scan flow. Rendering is in render.js, pure logic in view-model.js,
// ui-state.js and scan-state.js.
// Rule: a scan only starts on a click (or Enter in the form). ?repo= and USE DEMO REPO fill the field and nothing more.
import { renderReport, renderState } from './render.js';
import { parseRepoInput, deepLinkRepo, errorState, formatScanTime, STATES, DEMO_REPO, DEMO_SHORT } from './view-model.js';
import { initialState, step } from './scan-state.js';
import { landAfterScan } from './navigate.js';
import { fixtureName, loadFixture } from './fixture-mode.js';
import { initTabs } from './tabs.js';
import { bindDisclosure } from './disclosure.js';
import { SITE_URL, deepLink, withoutRepoParam } from './site.js';

const CLIENT_TIMEOUT_MS = 70000; // the function allows 60 s
const form = document.getElementById('scan-form');
const input = document.getElementById('repo-input');
const button = document.getElementById('scan-btn');
const clearBtn = document.getElementById('clear-btn');
const stamp = document.getElementById('scan-time');
const banner = document.getElementById('banner'); // idle, SCANNING, and error strips. The report stays below it.
const out = document.getElementById('out');
let state = initialState();

function looksLikeReport(r) {
  return r && typeof r === 'object' && r.counts && Array.isArray(r.findings) && r.repo && typeof r.mood === 'string';
}

// Applies one event, then repaints the banner and the SCAN button. The report below is only redrawn on a new report.
function dispatch(event) {
  const next = step(state, event);
  if (next === state) return;
  state = next;
  button.disabled = !state.canScan;
  clearBtn.disabled = !state.canScan; // CLEAR is off while a scan runs
  button.textContent = state.canScan ? 'SCAN' : 'SCANNING';
  out.setAttribute('aria-busy', String(state.phase === 'loading'));
  if (state.banner) renderState(banner, state.banner.text, state.banner.kind, state.banner.kind === 'loading');
  else banner.replaceChildren();
}

function showReport(report, { land }) {
  renderReport(report, out);
  stamp.textContent = formatScanTime(report.receipt?.scannedAt ?? new Date());
  if (land) landAfterScan(report.counts);
}

async function fetchReport(url) {
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
    if (!res.ok) return { error: errorState(res.status, body?.error?.code) };
    if (!looksLikeReport(body)) return { error: STATES.failed };
    return { report: body };
  } catch {
    return { error: STATES.failed }; // network failure or timeout
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.canScan) return;
  const p = parseRepoInput(input.value);
  input.setAttribute('aria-invalid', String(!p.ok));
  if (!p.ok) { dispatch({ type: 'fail', text: STATES.badInput }); input.focus(); return; } // the old report stays
  input.value = p.url;
  dispatch({ type: 'start', owner: p.owner, name: p.name });
  const result = await fetchReport(p.url);
  if (result.report) {
    dispatch({ type: 'ok', report: result.report });
    showReport(result.report, { land: true });
  } else {
    dispatch({ type: 'fail', text: result.error }); // the old report stays
  }
});

// CLEAR: empties the field, removes the report and any strip, drops ?repo= from the address bar, and puts focus back
// in the field. It never calls the API, and does nothing while a scan is running.
clearBtn.addEventListener('click', () => {
  if (!state.canScan) return;
  dispatch({ type: 'clear' });
  out.replaceChildren();
  stamp.textContent = '-';
  input.value = '';
  input.setAttribute('aria-invalid', 'false');
  history.replaceState(null, '', location.pathname + withoutRepoParam(location.search) + location.hash);
  input.focus();
});

// USE DEMO REPO fills the field and nothing else.
document.getElementById('demo-btn').addEventListener('click', () => {
  input.value = DEMO_SHORT;
  input.setAttribute('aria-invalid', 'false');
  input.focus();
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
  renderState(banner, state.banner.text, state.banner.kind);
  const fx = fixtureName(location.search, location.hostname);
  if (fx) {
    try {
      const report = await loadFixture(fx);
      dispatch({ type: 'ok', report });
      showReport(report, { land: false }); // dev only: stay at the top so screenshots are stable
    } catch { dispatch({ type: 'fail', text: STATES.failed }); }
  }
}

init();
