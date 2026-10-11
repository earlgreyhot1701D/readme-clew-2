// The one place a scan request is made, for the page and for the extension popup (this file is synced into the extension).
// POST {base}/api/scan with { repo }. base is '' on the page (same origin) and the site address in the popup.
// Never throws: it returns { report } or { error, retryable }, where error is the text for the error strip.
import { errorState, STATES } from './view-model.js';
import { retryableError } from './scan-state.js';

export const CLIENT_TIMEOUT_MS = 70000; // the function allows 60 s

function looksLikeReport(r) {
  return r && typeof r === 'object' && r.counts && Array.isArray(r.findings) && r.repo && typeof r.mood === 'string';
}

export async function fetchScan(repoUrl, { base = '', fetchImpl = globalThis.fetch, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: repoUrl }),
      signal: ctl.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const code = body?.error?.code;
    if (!res.ok) return { error: errorState(res.status, code), retryable: retryableError(res.status, code) };
    if (!looksLikeReport(body)) return { error: STATES.failed, retryable: true };
    return { report: body };
  } catch {
    return { error: STATES.failed, retryable: true }; // network failure or timeout
  } finally {
    clearTimeout(timer);
  }
}
