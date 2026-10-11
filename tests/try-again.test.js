// TRY AGAIN on the error strip: which errors get it, that it re-sends the same repo, and that nothing retries by itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, step, retryTarget, retryableError } from '../web/scan-state.js';
import { STATES, errorState } from '../web/view-model.js';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const render = readFileSync(new URL('../web/render-strips.js', import.meta.url), 'utf8'); // the shared strips, including the error strip
const repo = { owner: 'o', name: 'r', url: 'https://github.com/o/r' };
const run = (...events) => events.reduce((s, e) => step(s, e), initialState());
const reportA = { id: 'A', repo: { owner: 'o', name: 'a' }, counts: {}, findings: [] };

test('retryableError: failed scans and rate limits get TRY AGAIN; bad input, not found, and not-JS do not', () => {
  const yes = [[500, 'internal'], [502, 'jev_unavailable'], [504, 'jev_timeout'], [503, 'github_rate_limited'], [503, 'jev_rate_limited'], [429, 'rate_limited'], [0, undefined], [502, 'github_unavailable'], [504, 'github_timeout']];
  for (const [s, c] of yes) assert.equal(retryableError(s, c), true, `${s} ${c}`);
  const no = [[400, 'bad_url'], [400, 'missing_repo'], [404, 'github_not_found'], [404, 'github_no_readme'], [404, undefined], [422, 'not_js_repo'], [422, 'jev_too_large']];
  for (const [s, c] of no) assert.equal(retryableError(s, c), false, `${s} ${c}`);
  // and it agrees with the strip text: every strip that offers a retry is a "failed" or "rate limited" strip
  for (const [s, c] of yes) assert.ok([STATES.failed, STATES.rateLimited].includes(errorState(s, c)), `${s} ${c}`);
  for (const [s, c] of no) assert.ok([STATES.badInput, STATES.notFound, STATES.notJs, STATES.failed].includes(errorState(s, c)));
});
test('a failed scan carries the repo to retry, and retryTarget hands it back', () => {
  const s = run({ type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.failed, retry: repo });
  assert.deepEqual(s.banner, { kind: 'error', text: STATES.failed, retry: repo });
  assert.deepEqual(retryTarget(s), repo);
});
test('an error without a retry (bad input, not found, not JS) has no target and no retry key in the banner', () => {
  const s = run({ type: 'fail', text: STATES.badInput });
  assert.deepEqual(s.banner, { kind: 'error', text: STATES.badInput });
  assert.equal(retryTarget(s), null);
  const nf = run({ type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.notFound, retry: null });
  assert.equal(retryTarget(nf), null);
  assert.ok(!('retry' in nf.banner));
});
test('while a scan runs there is nothing to retry: starting a scan replaces the error strip, and retryTarget is null', () => {
  const failed = run({ type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.failed, retry: repo });
  const again = step(failed, { type: 'start', owner: repo.owner, name: repo.name });
  assert.equal(again.banner.kind, 'loading');
  assert.equal(again.canScan, false);
  assert.equal(retryTarget(again), null);
  // a second click during the scan is ignored by the machine too
  assert.equal(step(again, { type: 'start', owner: 'x', name: 'y' }), again);
});
test('TRY AGAIN then success: the new report replaces everything and the strip is gone', () => {
  const failed = run({ type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.failed, retry: repo });
  const s = step(step(failed, { type: 'start', owner: 'o', name: 'r' }), { type: 'ok', report: reportA });
  assert.deepEqual([s.banner, s.report, s.canScan, retryTarget(s)], [null, reportA, true, null]);
});
test('TRY AGAIN then another failure: a new strip with TRY AGAIN again, still for the same repo, and the old report stays', () => {
  const s = run({ type: 'start', owner: 'a', name: 'b' }, { type: 'ok', report: reportA }, { type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.failed, retry: repo },
    { type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.rateLimited, retry: repo });
  assert.equal(s.report, reportA);
  assert.deepEqual(retryTarget(s), repo);
  assert.equal(s.banner.text, STATES.rateLimited);
});
test('CLEAR removes the strip and its retry target', () => {
  const s = run({ type: 'start', owner: 'o', name: 'r' }, { type: 'fail', text: STATES.failed, retry: repo }, { type: 'clear' });
  assert.equal(retryTarget(s), null);
  assert.deepEqual(s, initialState());
});
test('retryTarget is null for a non-error banner and for junk state', () => {
  assert.equal(retryTarget(initialState()), null);
  assert.equal(retryTarget({ canScan: true, banner: null }), null);
  assert.equal(retryTarget({ canScan: false, banner: { kind: 'error', text: 'x', retry: repo } }), null);
});

// ---- wiring: one click, same repo, no automatic retry ----
test('wiring: TRY AGAIN calls runScan with the stored repo, runScan ignores a click while a scan runs, and the form uses runScan too', () => {
  assert.match(app, /const again = retryTarget\(state\) \? \(\) => \{ const r = retryTarget\(state\); if \(r\) runScan\(r\); \} : null;/);
  assert.match(app, /async function runScan\(p\) \{\s*if \(!state\.canScan\) return;/);
  assert.match(app, /dispatch\(\{ type: 'fail', text: result\.error, retry: result\.retryable \? \{ owner: p\.owner, name: p\.name, url: p\.url \} : null \}\)/);
  assert.match(app, /await runScan\(p\);/);
  assert.equal((app.match(/fetchScan\(/g) ?? []).length, 1, 'one call, inside runScan (the client itself is in scan-client.js)');
  assert.equal((app.match(/runScan\(/g) ?? []).length, 3, 'definition, the strip button, and the form');
});
test('wiring: nothing retries by itself, there is no timer, loop, or retry count in the page code', () => {
  const code = app.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /setInterval|setTimeout\(\s*\(\)\s*=>\s*runScan|retries|attempt|backoff|while \(/);
  assert.equal((code.match(/setTimeout/g) ?? []).length, 0, 'the page code has no timers at all');
  const client = readFileSync(new URL('../web/scan-client.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal((client.match(/setTimeout/g) ?? []).length, 1, 'the scan client has one timer: the request timeout');
  assert.doesNotMatch(client, /retry\(|attempt|backoff|while \(|for \(/);
});
test('wiring: the button is a real button on error strips only, labelled TRY AGAIN, and it only fires on a click', () => {
  assert.match(render, /else if \(kind === 'error' && onRetry\)/);
  assert.match(render, /el\('button', 'btn btn-small retry', 'TRY AGAIN', \{ type: 'button' \}\)/);
  assert.match(render, /again\.addEventListener\('click', onRetry\)/);
  assert.doesNotMatch(render.replace(/\/\/.*$/gm, ''), /onRetry\(\)/); // never called directly
});
test('wiring: a bad-input error does not offer TRY AGAIN', () => {
  assert.match(app, /dispatch\(\{ type: 'fail', text: STATES\.badInput \}\)/); // no retry field on this one
  assert.doesNotMatch(app.match(/dispatch\(\{ type: 'fail', text: STATES\.badInput \}\)[^\n]*/)[0], /retry/);
});
