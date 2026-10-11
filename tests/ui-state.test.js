// Pure UI rules (web/ui-state.js): tabs, accordion defaults, and the SHOW ALL threshold. Offline, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, DEFAULT_TAB, ROW_LIMIT, nextTab, defaultOpen, visibleRows, showAllLabel } from '../web/ui-state.js';
import { bucketSections } from '../web/view-model.js';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `f-${i}` }));

test('tabs: SCAN, KEY, ABOUT in that order, and SCAN is the default', () => {
  assert.deepEqual(TABS, ['scan', 'key', 'about']);
  assert.equal(DEFAULT_TAB, 'scan');
});
test('nextTab: arrows wrap around, Home and End jump, any other key stays put, an unknown tab falls back to SCAN', () => {
  assert.equal(nextTab('scan', 'ArrowRight'), 'key');
  assert.equal(nextTab('about', 'ArrowRight'), 'scan');
  assert.equal(nextTab('scan', 'ArrowLeft'), 'about');
  assert.equal(nextTab('key', 'ArrowLeft'), 'scan');
  assert.equal(nextTab('key', 'Home'), 'scan');
  assert.equal(nextTab('key', 'End'), 'about');
  for (const k of ['Enter', ' ', 'a', 'Tab', 'ArrowUp', 'ArrowDown']) assert.equal(nextTab('key', k), 'key', k);
  assert.equal(nextTab('nonsense', 'ArrowRight'), 'scan');
});
test('accordion defaults: Contradicted and Missing open, Unverifiable and Verified closed', () => {
  assert.equal(defaultOpen('contradicted', 3), true);
  assert.equal(defaultOpen('missing', 3), true);
  assert.equal(defaultOpen('unverifiable', 3), false);
  assert.equal(defaultOpen('verified', 3), false);
});
test('accordion defaults: an empty bucket is open, so NONE FOUND is visible', () => {
  for (const b of ['contradicted', 'missing', 'unverifiable', 'verified']) assert.equal(defaultOpen(b, 0), true, b);
});
test('accordion defaults flow through bucketSections for a real v1-shaped report', () => {
  const f = (bucket, n) => Array.from({ length: n }, (_, i) => ({ id: `${bucket}${i}`, bucket, claimType: 'dependency', line: i + 1, quote: 'q', evidence: { file: null, detail: 'd' }, decidedBy: 'rule', confidence: null, lowConfidence: false, link: null }));
  const report = { findings: [...f('missing', 4), ...f('unverifiable', 140), ...f('verified', 8)] };
  const open = Object.fromEntries(bucketSections(report).map((s) => [s.bucket, s.open]));
  assert.deepEqual(open, { contradicted: true, missing: true, unverifiable: false, verified: false });
});
test('SHOW ALL threshold: 0 to 10 rows show everything with no button, 11 shows 10 and hides 1', () => {
  assert.equal(ROW_LIMIT, 10);
  for (const n of [0, 1, 9, 10]) {
    const v = visibleRows(rows(n));
    assert.equal(v.shown.length, n, `${n} rows`);
    assert.equal(v.hiddenCount, 0, `${n} rows`);
  }
  const v = visibleRows(rows(11));
  assert.equal(v.shown.length, 10);
  assert.equal(v.hiddenCount, 1);
  assert.deepEqual(v.shown.map((r) => r.id), rows(10).map((r) => r.id)); // the first 10, in order
});
test('SHOW ALL on a 140-row bucket: 10 shown, 130 hidden, and showAll returns all 140', () => {
  const v = visibleRows(rows(140));
  assert.deepEqual([v.shown.length, v.hiddenCount], [10, 130]);
  const all = visibleRows(rows(140), true);
  assert.deepEqual([all.shown.length, all.hiddenCount], [140, 0]);
  assert.equal(showAllLabel(140), 'SHOW ALL 140'); // N is the bucket total
});
