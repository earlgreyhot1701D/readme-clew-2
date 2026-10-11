// Switching tabs, opening HOW?, and opening a bucket never start a scan. Tested two ways:
// the modules cannot reach the scan code (imports), and a fake DOM run never calls fetch or submits the form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initTabs } from '../web/tabs.js';
import { bindDisclosure } from '../web/disclosure.js';
import { TABS } from '../web/ui-state.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

class Fake extends EventTarget {
  constructor() { super(); this.attrs = {}; this.hidden = false; this.tabIndex = 0; this.focused = 0; this.submitted = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  focus() { this.focused += 1; }
}
const press = (el, key) => { const e = Object.assign(new Event('keydown', { cancelable: true }), { key }); el.dispatchEvent(e); return e; };

function setup() {
  const els = {};
  for (const t of TABS) { els[`tab-${t}`] = new Fake(); els[`panel-${t}`] = new Fake(); }
  const root = new Fake();
  const select = initTabs((id) => els[id], root);
  return { els, root, select };
}

// Any call to fetch, or any form submit, fails the test.
async function guarded(fn) {
  const real = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => { fetches += 1; throw new Error('fetch must not be called'); };
  try { await fn(); } finally { globalThis.fetch = real; }
  assert.equal(fetches, 0);
}

test('tabs.js and disclosure.js import nothing that can scan: no app.js, no render, no fetch, no form', () => {
  const tabs = read('web/tabs.js');
  assert.deepEqual([...tabs.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]), ['./ui-state.js']);
  assert.doesNotMatch(tabs.replace(/\/\/.*$/gm, ''), /\bfetch\b|\bsubmit\b|scan-form|\/api\//);
  assert.doesNotMatch(read('web/disclosure.js').replace(/\/\/.*$/gm, ''), /\bimport\b|\bfetch\b|\bsubmit\b/);
});
test('SCAN is selected at start; the other panels are hidden; only the selected tab is a tab stop', () => {
  const { els } = setup();
  assert.equal(els['tab-scan'].attrs['aria-selected'], 'true');
  assert.equal(els['tab-key'].attrs['aria-selected'], 'false');
  assert.equal(els['tab-about'].attrs['aria-selected'], 'false');
  assert.deepEqual(TABS.map((t) => els[`panel-${t}`].hidden), [false, true, true]);
  assert.deepEqual(TABS.map((t) => els[`tab-${t}`].tabIndex), [0, -1, -1]);
});
test('clicking each tab switches panels and never calls fetch', async () => {
  const { els } = setup();
  await guarded(async () => {
    for (const t of ['key', 'about', 'scan', 'about', 'key']) {
      els[`tab-${t}`].dispatchEvent(new Event('click'));
      assert.deepEqual(TABS.map((x) => els[`tab-${x}`].attrs['aria-selected']), TABS.map((x) => String(x === t)), t);
      assert.deepEqual(TABS.map((x) => els[`panel-${x}`].hidden), TABS.map((x) => x !== t), t);
    }
  });
});
test('keyboard: arrows move and focus the next tab, other keys do nothing, and no fetch happens', async () => {
  const { els } = setup();
  await guarded(async () => {
    const e = press(els['tab-scan'], 'ArrowRight');
    assert.equal(e.defaultPrevented, true);
    assert.equal(els['tab-key'].attrs['aria-selected'], 'true');
    assert.equal(els['tab-key'].focused, 1);
    press(els['tab-key'], 'End');
    assert.equal(els['tab-about'].attrs['aria-selected'], 'true');
    const other = press(els['tab-about'], 'a');
    assert.equal(other.defaultPrevented, false);
    assert.equal(els['tab-about'].attrs['aria-selected'], 'true');
  });
});
test('a [data-goto-tab] click anywhere opens that tab (the report footer link uses this) and never scans', async () => {
  // An event's target is the element it is dispatched on, so the fake root plays the clicked element:
  // its closest() returns the [data-goto-tab] link, just as a click on a child of the link would.
  const { els, root } = setup();
  const link = new Fake();
  link.attrs['data-goto-tab'] = 'about';
  root.closest = (sel) => (sel === '[data-goto-tab]' ? link : null);
  await guarded(async () => { root.dispatchEvent(new Event('click')); });
  assert.equal(els['tab-about'].attrs['aria-selected'], 'true');
  assert.equal(els['tab-scan'].attrs['aria-selected'], 'false');
  // an unknown tab name is ignored
  els['tab-key'].dispatchEvent(new Event('click'));
  link.attrs['data-goto-tab'] = 'nonsense';
  root.dispatchEvent(new Event('click'));
  assert.equal(els['tab-key'].attrs['aria-selected'], 'true');
});
test('bindDisclosure: aria-expanded and hidden stay in step, and toggling never calls fetch', async () => {
  const btn = new Fake();
  const panel = new Fake();
  const seen = [];
  await guarded(async () => {
    const set = bindDisclosure(btn, panel, { open: false, onToggle: (o) => seen.push(o) });
    assert.deepEqual([btn.attrs['aria-expanded'], panel.hidden], ['false', true]);
    btn.dispatchEvent(new Event('click'));
    assert.deepEqual([btn.attrs['aria-expanded'], panel.hidden], ['true', false]);
    btn.dispatchEvent(new Event('click'));
    assert.deepEqual([btn.attrs['aria-expanded'], panel.hidden], ['false', true]);
    set(true);
    assert.deepEqual([btn.attrs['aria-expanded'], panel.hidden], ['true', false]);
  });
  assert.deepEqual(seen, [false, true, false, true]);
  const open = new Fake();
  const p2 = new Fake();
  bindDisclosure(open, p2, { open: true });
  assert.deepEqual([open.attrs['aria-expanded'], p2.hidden], ['true', false]);
});
