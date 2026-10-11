// Pure UI rules (web/ui-state.js): tabs, accordion defaults, and the SHOW ALL threshold. Offline, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Phase C: chip-to-section mapping, where to land after a scan, motion, and bucket notes.
import { BUCKET_ORDER, sectionId, chipLabel, firstProblemBucket, scrollBehavior, bucketNote } from '../web/ui-state.js';

test('chip to section: every bucket maps to the id its header controls, and anything else maps to nothing', () => {
  assert.deepEqual(BUCKET_ORDER.map(sectionId), ['sec-contradicted', 'sec-missing', 'sec-unverifiable', 'sec-verified']);
  for (const bad of ['', 'nope', null, undefined, '../x', 'Contradicted']) assert.equal(sectionId(bad), null, String(bad));
  // the section element built by the renderer uses the same function, so chip and section cannot drift apart
  assert.match(readFileSync(new URL('../web/render-sections.js', import.meta.url), 'utf8'), /const id = sectionId\(sec\.bucket\);/);
});
test('chip label: "Contradicted, 2, go to section" for every bucket, including zero', () => {
  assert.equal(chipLabel('contradicted', 2), 'Contradicted, 2, go to section');
  assert.equal(chipLabel('missing', 0), 'Missing, 0, go to section');
  assert.equal(chipLabel('unverifiable', 140), 'Unverifiable, 140, go to section');
  assert.equal(chipLabel('verified', 8), 'Verified, 8, go to section');
});
test('first problem bucket: Contradicted, then Missing, then Unverifiable; Verified never; all empty gives null', () => {
  assert.equal(firstProblemBucket({ contradicted: 1, missing: 2, unverifiable: 3, verified: 9 }), 'contradicted');
  assert.equal(firstProblemBucket({ contradicted: 0, missing: 2, unverifiable: 3, verified: 9 }), 'missing');
  assert.equal(firstProblemBucket({ contradicted: 0, missing: 0, unverifiable: 3, verified: 9 }), 'unverifiable');
  assert.equal(firstProblemBucket({ contradicted: 0, missing: 0, unverifiable: 0, verified: 9 }), null);
  assert.equal(firstProblemBucket({ contradicted: 0, missing: 4, unverifiable: 140, verified: 8 }), 'missing'); // the v1 report
  assert.equal(firstProblemBucket({}), null);
  assert.equal(firstProblemBucket(null), null);
  assert.equal(firstProblemBucket({ contradicted: 'x' }), null); // junk counts are not problems
});
test('scroll behavior: smooth, except when the reader asked for reduced motion', () => {
  assert.equal(scrollBehavior(false), 'smooth');
  assert.equal(scrollBehavior(true), 'auto');
});
test('bucket note: the Haiku line for that bucket, trimmed; null, empty, or missing gives null and never a placeholder', () => {
  const report = { notes: { summary: 's', buckets: { verified: '  Eight claims match.  ', missing: 'Four imports are not mentioned.', unverifiable: '', contradicted: null } } };
  assert.equal(bucketNote(report, 'verified'), 'Eight claims match.');
  assert.equal(bucketNote(report, 'missing'), 'Four imports are not mentioned.');
  assert.equal(bucketNote(report, 'unverifiable'), null);
  assert.equal(bucketNote(report, 'contradicted'), null);
  for (const r of [{ notes: null }, { notes: { summary: 's' } }, {}, null, { notes: { buckets: { missing: 42 } } }]) assert.equal(bucketNote(r, 'missing'), null);
});
