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
      return { ...state, phase: 'error', banner: { kind: 'error', text: event.text }, canScan: true };
    default:
      return state;
  }
}

// DOWNLOAD JSON needs a report in memory.
export function canDownload(state) {
  return state.report !== null && typeof state.report === 'object';
}
