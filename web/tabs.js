// SCAN / KEY / ABOUT tabs. Switching a tab only shows and hides panels. It never starts a scan:
// this file imports nothing but ui-state.js, and nothing here touches fetch or the form.
import { TABS, DEFAULT_TAB, nextTab } from './ui-state.js';

// getEl and root are injectable so tests can run this without a browser.
export function initTabs(getEl = (id) => document.getElementById(id), root = document) {
  const tabs = TABS.map((id) => ({ id, btn: getEl(`tab-${id}`), panel: getEl(`panel-${id}`) }));
  function select(id, focus) {
    for (const t of tabs) {
      const on = t.id === id;
      t.btn.setAttribute('aria-selected', String(on));
      t.btn.tabIndex = on ? 0 : -1; // one tab stop for the tab list, arrows move inside it
      t.panel.hidden = !on;
      if (on && focus) t.btn.focus();
    }
  }
  for (const t of tabs) {
    t.btn.addEventListener('click', () => select(t.id, false));
    t.btn.addEventListener('keydown', (e) => {
      const to = nextTab(t.id, e.key);
      if (to !== t.id) { e.preventDefault(); select(to, true); }
    });
  }
  // Any element with data-goto-tab="about" (for example the report footer link) opens that tab.
  if (root && root.addEventListener) {
    root.addEventListener('click', (e) => {
      const hit = e.target && e.target.closest ? e.target.closest('[data-goto-tab]') : null;
      const to = hit ? hit.getAttribute('data-goto-tab') : null;
      if (to && TABS.includes(to)) select(to, true);
    });
  }
  select(DEFAULT_TAB, false);
  return select;
}
