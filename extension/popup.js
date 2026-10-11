// The popup. It scans the repo in the current tab, and only when SCAN is clicked (opening the popup never scans).
// Permissions: activeTab (to read this tab's address) and one host permission (to call the scan API). Nothing is stored.
import { renderState } from './shared/render-strips.js';
import { initialState, step, retryTarget } from './shared/scan-state.js';
import { fetchScan } from './shared/scan-client.js';
import { formatScanTime } from './shared/view-model.js';
import { SITE_URL } from './shared/site.js';
import { repoFromTabUrl } from './tab-url.js';
import { renderPopupReport } from './popup-render.js';
import { POPUP_TEXT } from './popup-model.js';

const scanBtn = document.getElementById('scan-btn');
const repoName = document.getElementById('repo-name');
const stamp = document.getElementById('scan-time');
const banner = document.getElementById('banner');
const out = document.getElementById('out');
let state = initialState();
let repo = null; // { owner, name, url } of the current tab, or null

// Applies one event, then repaints the strip and the SCAN button. The report below only changes on a new report.
function dispatch(event) {
  const next = step(state, event);
  if (next === state) return;
  state = next;
  scanBtn.disabled = !state.canScan || !repo;
  scanBtn.textContent = state.canScan ? 'SCAN' : 'SCANNING';
  out.setAttribute('aria-busy', String(state.phase === 'loading'));
  if (state.banner) {
    const again = retryTarget(state) ? () => { const r = retryTarget(state); if (r) runScan(r); } : null;
    renderState(banner, state.banner.text, state.banner.kind, state.banner.kind === 'loading', again);
  } else banner.replaceChildren();
}

// The only code that starts a scan. SCAN and TRY AGAIN both come through here, on a click.
async function runScan(target) {
  if (!state.canScan) return; // a scan is running: ignore
  dispatch({ type: 'start', owner: target.owner, name: target.name });
  const result = await fetchScan(target.url, { base: SITE_URL });
  if (result.report) {
    dispatch({ type: 'ok', report: result.report });
    renderPopupReport(result.report, out);
    stamp.textContent = formatScanTime(result.report.receipt?.scannedAt ?? new Date());
  } else {
    dispatch({ type: 'fail', text: result.error, retry: result.retryable ? { owner: target.owner, name: target.name, url: target.url } : null });
  }
}

scanBtn.addEventListener('click', () => { if (repo) runScan(repo); });

// The address of the tab in front. activeTab lets the popup read it after the user opens the popup.
async function currentTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? '';
  } catch {
    return '';
  }
}

async function init() {
  repo = repoFromTabUrl(await currentTabUrl());
  repoName.textContent = repo ? `${repo.owner}/${repo.name}` : '-';
  scanBtn.disabled = !repo;
  renderState(banner, repo ? POPUP_TEXT.ready : POPUP_TEXT.notRepo, 'idle'); // no scan here: only a click scans
}

init();
