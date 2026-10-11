// The scan state machine (pure). One rule: a report on screen stays on screen until a newer one replaces it.
//   start -> loading: banner SCANNING owner/name, SCAN disabled, the old report stays.
//   ok    -> done:    the new report replaces the old one, the banner goes away.
//   fail  -> error:   the old report stays, the error strip shows above it.
//   clear -> idle:    everything goes, as on a fresh page. Not while a scan is running.
// A start while a scan is running is ignored, so a double click cannot send two scans.
import { STATES, loadingText } from './view-model.js';

export function initialState() {
  return { phase: 'idle', report: null, banner: { kind: 'idle', text: STATES.idle }, canScan: true };
}

export function step(state, event) {
  switch (event?.type) {
    case 'start':
      if (!state.canScan) return state;
      return { ...state, phase: 'loading', banner: { kind: 'loading', text: loadingText(event.owner, event.name) }, canScan: false };
    case 'clear':
      // CLEAR: back to the home screen, with no report and no strip. Ignored while a scan runs. No request is made.
      return state.canScan ? initialState() : state;
    case 'ok':
      return { phase: 'done', report: event.report, banner: null, canScan: true };
    case 'fail':
      // retry, when present, is the repo to send again (the TRY AGAIN button). It is only for errors a second try could fix.
      return { ...state, phase: 'error', banner: { kind: 'error', text: event.text, ...(event.retry ? { retry: event.retry } : {}) }, canScan: true };
    default:
      return state;
  }
}

// Can another try help? Yes for a failed or slow scan and for a rate limit. No for a bad URL, a repo that is not there
// or not public, or a repo that is not a JS/TS project: the answer would be the same.
export function retryableError(httpStatus, code) {
  if (httpStatus === 404 || httpStatus === 422) return false;
  return !['bad_url', 'missing_repo', 'github_not_found', 'github_no_readme', 'not_js_repo'].includes(code);
}

// The repo TRY AGAIN would send, or null. Only while no scan is running.
export function retryTarget(state) {
  return state.canScan && state.banner?.kind === 'error' ? state.banner.retry ?? null : null;
}

// DOWNLOAD JSON needs a report in memory.
export function canDownload(state) {
  return state.report !== null && typeof state.report === 'object';
}
