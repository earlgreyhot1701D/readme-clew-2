// Pure UI rules: tabs, accordion defaults, and the row limit. No DOM, so tests can pin every one of them.
export const TABS = ['scan', 'key', 'about'];
export const DEFAULT_TAB = 'scan';
export const ROW_LIMIT = 10; // rows drawn per open section before SHOW ALL

// Keyboard move between tabs (ARIA tabs pattern). Any other key leaves the tab where it is.
export function nextTab(current, key) {
  const i = TABS.indexOf(current);
  if (i === -1) return DEFAULT_TAB;
  if (key === 'ArrowRight') return TABS[(i + 1) % TABS.length];
  if (key === 'ArrowLeft') return TABS[(i + TABS.length - 1) % TABS.length];
  if (key === 'Home') return TABS[0];
  if (key === 'End') return TABS[TABS.length - 1];
  return current;
}

// Contradicted and Missing start open. Unverifiable and Verified start closed.
// An empty bucket starts open, so NONE FOUND is visible and the ledger never looks broken.
export function defaultOpen(bucket, count) {
  if (count === 0) return true;
  return bucket === 'contradicted' || bucket === 'missing';
}

// First ROW_LIMIT rows, or all of them. hiddenCount drives the SHOW ALL button.
export function visibleRows(rows, showAll = false) {
  if (showAll || rows.length <= ROW_LIMIT) return { shown: rows, hiddenCount: 0 };
  return { shown: rows.slice(0, ROW_LIMIT), hiddenCount: rows.length - ROW_LIMIT };
}

export function showAllLabel(total) {
  return `SHOW ALL ${total}`;
}
