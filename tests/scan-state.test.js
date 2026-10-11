// The rescan state machine (web/scan-state.js). One rule: a report on screen stays until a newer one replaces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, canDownload } from '../web/scan-state.js';
import { STATES } from '../web/view-model.js';

const reportA = { id: 'A', repo: { owner: 'o', name: 'a' }, counts: {}, findings: [] };
const reportB = { id: 'B', repo: { owner: 'o', name: 'b' }, counts: {}, findings: [] };
const run = (...events) => events.reduce((s, e) => step(s, e), initialState());

test('start: the page is idle, with the idle strip, SCAN enabled, and no report', () => {
  const s = initialState();
  assert.deepEqual(s, { phase: 'idle', report: null, banner: { kind: 'idle', text: STATES.idle }, canScan: true });
  assert.equal(canDownload(s), false);
});
test('first scan: loading shows SCANNING owner/name and disables SCAN; success shows the report and clears the strip', () => {
  const loading = run({ type: 'start', owner: 'o', name: 'a' });
  assert.equal(loading.phase, 'loading');
  assert.deepEqual(loading.banner, { kind: 'loading', text: 'SCANNING o/a ...' });
  assert.equal(loading.canScan, false);
  assert.equal(loading.report, null);
  const done = step(loading, { type: 'ok', report: reportA });
  assert.deepEqual([done.phase, done.report, done.banner, done.canScan], ['done', reportA, null, true]);
  assert.equal(canDownload(done), true);
});
test('rescan: the previous report stays on screen while the new scan runs, with SCANNING above it', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'b' });
  assert.equal(s.report, reportA); // still there
  assert.equal(s.phase, 'loading');
  assert.equal(s.banner.text, 'SCANNING o/b ...');
  assert.equal(s.canScan, false);
  assert.equal(canDownload(s), true); // the old report can still be saved
});
test('rescan success: the new report replaces the old one and the SCANNING strip goes away', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'b' }, { type: 'ok', report: reportB });
  assert.equal(s.report, reportB);
  assert.deepEqual([s.phase, s.banner, s.canScan], ['done', null, true]);
});
test('rescan error: the old report stays, the error strip shows above it, and SCAN works again', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'b' }, { type: 'fail', text: STATES.failed });
  assert.equal(s.report, reportA);
  assert.deepEqual(s.banner, { kind: 'error', text: STATES.failed });
  assert.equal(s.canScan, true);
  assert.equal(s.phase, 'error');
  // and a later success replaces it and clears the error
  const again = step(s, { type: 'ok', report: reportB });
  assert.deepEqual([again.report, again.banner], [reportB, null]);
});
test('first scan error: no report, just the error strip', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'fail', text: STATES.notFound });
  assert.deepEqual([s.report, s.banner.text, s.canScan], [null, STATES.notFound, true]);
  assert.equal(canDownload(s), false);
});
test('bad input while a report is showing: the error strip appears and the report stays', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'fail', text: STATES.badInput });
  assert.equal(s.report, reportA);
  assert.equal(s.banner.text, STATES.badInput);
});
test('a second start while a scan is running is ignored, so a double click sends one scan', () => {
  const loading = run({ type: 'start', owner: 'o', name: 'a' });
  const again = step(loading, { type: 'start', owner: 'o', name: 'zzz' });
  assert.equal(again, loading); // the very same state object: nothing changed
  assert.equal(again.banner.text, 'SCANNING o/a ...');
});
// ---- CLEAR (Phase D) ----
test('clear: a report on screen goes away and the page is back to the home screen', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'clear' });
  assert.deepEqual(s, initialState());
  assert.equal(s.report, null);
  assert.equal(canDownload(s), false);
  assert.equal(s.banner.kind, 'idle');
  assert.equal(s.canScan, true);
});
test('clear: an error strip over a report goes away too, and so does a first-scan error', () => {
  const withErr = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'b' }, { type: 'fail', text: STATES.failed }, { type: 'clear' });
  assert.deepEqual(withErr, initialState());
  const firstErr = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'fail', text: STATES.notFound }, { type: 'clear' });
  assert.deepEqual(firstErr, initialState());
});
test('clear is ignored while a scan is running: the report, the SCANNING strip, and the disabled SCAN stay', () => {
  const loading = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'b' });
  const after = step(loading, { type: 'clear' });
  assert.equal(after, loading); // the very same state object
  assert.equal(after.report, reportA);
  assert.equal(after.canScan, false);
  assert.equal(after.banner.text, 'SCANNING o/b ...');
});
test('clear on a fresh page changes nothing important, and a scan works again afterwards', () => {
  const s = step(initialState(), { type: 'clear' });
  assert.deepEqual(s, initialState());
  const again = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA }, { type: 'clear' }, { type: 'start', owner: 'o', name: 'b' });
  assert.equal(again.phase, 'loading');
  assert.equal(again.banner.text, 'SCANNING o/b ...');
});
test('clear wiring: the button exists, is off while scanning, and the handler makes no request', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(html, /<button id="clear-btn" class="btn" type="button">CLEAR<\/button>/);
  assert.ok(html.indexOf('id="scan-btn"') < html.indexOf('id="clear-btn"'), 'CLEAR sits next to SCAN, after it');
  assert.match(app, /clearBtn\.disabled = !state\.canScan/);
  const handler = app.slice(app.indexOf('clearBtn.addEventListener'), app.indexOf('// USE DEMO REPO'));
  assert.ok(handler.length > 100);
  assert.match(handler, /if \(!state\.canScan\) return;/);
  assert.match(handler, /dispatch\(\{ type: 'clear' \}\)/);
  assert.match(handler, /out\.replaceChildren\(\)/); // the report is removed
  assert.match(handler, /input\.value = ''/); // the field is emptied
  assert.match(handler, /history\.replaceState\(null, '', location\.pathname \+ withoutRepoParam\(location\.search\) \+ location\.hash\)/);
  assert.match(handler, /input\.focus\(\)/); // focus goes back to the field
  assert.doesNotMatch(handler.replace(/\/\/.*$/gm, ''), /fetch|XMLHttpRequest|scan\(|fetchReport|start/); // it never calls the API
});
test('unknown events and junk change nothing, and step never mutates the old state', () => {
  const s = run({ type: 'start', owner: 'o', name: 'a' }, { type: 'ok', report: reportA });
  const frozen = JSON.stringify(s);
  assert.equal(step(s, { type: 'nonsense' }), s);
  assert.equal(step(s, null), s);
  assert.equal(step(s, undefined), s);
  step(s, { type: 'start', owner: 'o', name: 'b' });
  assert.equal(JSON.stringify(s), frozen);
});
