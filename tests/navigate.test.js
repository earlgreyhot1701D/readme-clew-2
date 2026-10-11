// Count chips and the landing spot after a scan (web/navigate.js), with a fake page. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goToSection, landAfterScan } from '../web/navigate.js';

// A fake header button: aria-expanded flips on click (as the real disclosure does), and it records scroll and focus.
function fakePage({ open = {}, reduced = false, status = true } = {}) {
  const log = [];
  const heads = {};
  for (const b of ['contradicted', 'missing', 'unverifiable', 'verified']) {
    heads[b] = {
      attrs: { 'aria-expanded': String(open[b] ?? false) },
      getAttribute(k) { return this.attrs[k] ?? null; },
      click() { this.attrs['aria-expanded'] = String(this.attrs['aria-expanded'] !== 'true'); log.push(['click', b]); },
      scrollIntoView(o) { log.push(['scroll', b, o.behavior, o.block]); },
      focus(o) { log.push(['focus', b, o]); },
    };
  }
  const statusEl = status ? { tabIndex: 0, scrollIntoView(o) { log.push(['scroll', 'status', o.behavior]); }, focus(o) { log.push(['focus', 'status', o]); } } : null;
  const doc = {
    querySelector(sel) {
      const m = sel.match(/^button\.acc-head\[aria-controls="sec-(\w+)"\]$/);
      if (m) return heads[m[1]] ?? null;
      if (sel === '.status-fill') return statusEl;
      return null;
    },
  };
  const win = { matchMedia: (q) => ({ matches: reduced && q.includes('prefers-reduced-motion') }) };
  return { doc, win, log, heads, statusEl };
}

test('a count chip opens its section when closed, scrolls to it, and focuses the header', () => {
  const p = fakePage({ open: { unverifiable: false } });
  assert.equal(goToSection('unverifiable', p), true);
  assert.deepEqual(p.log, [['click', 'unverifiable'], ['scroll', 'unverifiable', 'smooth', 'start'], ['focus', 'unverifiable', { preventScroll: true }]]);
  assert.equal(p.heads.unverifiable.getAttribute('aria-expanded'), 'true');
});
test('a count chip on a section that is already open does not close it', () => {
  const p = fakePage({ open: { missing: true } });
  goToSection('missing', p);
  assert.equal(p.heads.missing.getAttribute('aria-expanded'), 'true');
  assert.ok(!p.log.some((e) => e[0] === 'click'));
  assert.deepEqual(p.log.map((e) => e[0]), ['scroll', 'focus']);
});
test('reduced motion: no smooth scrolling', () => {
  const p = fakePage({ reduced: true });
  goToSection('verified', p);
  assert.equal(p.log.find((e) => e[0] === 'scroll')[2], 'auto');
  const q = fakePage({ reduced: false });
  goToSection('verified', q);
  assert.equal(q.log.find((e) => e[0] === 'scroll')[2], 'smooth');
});
test('an unknown bucket goes nowhere and breaks nothing', () => {
  const p = fakePage();
  assert.equal(goToSection('nonsense', p), false);
  assert.equal(goToSection(undefined, p), false);
  assert.deepEqual(p.log, []);
});
test('after a scan: the first non-empty bucket gets scroll and focus, and a closed section stays closed', () => {
  const p = fakePage({ open: { contradicted: true, missing: true } });
  assert.equal(landAfterScan({ contradicted: 0, missing: 4, unverifiable: 140, verified: 8 }, p), true); // the v1 report
  assert.deepEqual(p.log.map((e) => [e[0], e[1]]), [['scroll', 'missing'], ['focus', 'missing']]);
  const q = fakePage({ open: { unverifiable: false } });
  landAfterScan({ contradicted: 0, missing: 0, unverifiable: 3, verified: 1 }, q);
  assert.deepEqual(q.log.map((e) => [e[0], e[1]]), [['scroll', 'unverifiable'], ['focus', 'unverifiable']]);
  assert.equal(q.heads.unverifiable.getAttribute('aria-expanded'), 'false'); // not opened for the reader
});
test('after a scan with a Contradicted row, that header wins over Missing and Unverifiable', () => {
  const p = fakePage({ open: { contradicted: true } });
  landAfterScan({ contradicted: 1, missing: 5, unverifiable: 9, verified: 0 }, p);
  assert.equal(p.log[0][1], 'contradicted');
});
test('after a scan with nothing to fix: focus goes to the status strip, not to Verified', () => {
  const p = fakePage();
  assert.equal(landAfterScan({ contradicted: 0, missing: 0, unverifiable: 0, verified: 12 }, p), true);
  assert.deepEqual(p.log, [['scroll', 'status', 'smooth'], ['focus', 'status', { preventScroll: true }]]);
  assert.equal(p.statusEl.tabIndex, -1); // it can take focus from code, but is not a tab stop
});
test('after a scan with reduced motion: the landing scroll is not smooth either', () => {
  const p = fakePage({ reduced: true, open: { missing: true } });
  landAfterScan({ contradicted: 0, missing: 2, unverifiable: 0, verified: 0 }, p);
  assert.equal(p.log[0][2], 'auto');
  const q = fakePage({ reduced: true });
  landAfterScan({ contradicted: 0, missing: 0, unverifiable: 0, verified: 3 }, q);
  assert.equal(q.log[0][2], 'auto');
});
test('no status strip on the page: landAfterScan returns false instead of throwing', () => {
  const p = fakePage({ status: false });
  assert.equal(landAfterScan({ contradicted: 0, missing: 0, unverifiable: 0, verified: 1 }, p), false);
});
