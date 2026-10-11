// Pure UI rules: tabs, accordion defaults, the row limit, chip-to-section mapping, and where to land after a scan.
// No DOM, so tests can pin every one of them.
export const TABS = ['scan', 'key', 'about'];
export const DEFAULT_TAB = 'scan';
export const ROW_LIMIT = 10; // rows drawn per open section before SHOW ALL
export const BUCKET_ORDER = ['contradicted', 'missing', 'unverifiable', 'verified'];
const PROBLEM_ORDER = ['contradicted', 'missing', 'unverifiable']; // where to land after a scan

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

// The id of a bucket's body element. Its header button points at it with aria-controls, so a count chip finds
// its section through this one function.
export function sectionId(bucket) {
  return BUCKET_ORDER.includes(bucket) ? `sec-${bucket}` : null;
}

// Screen reader name for a count chip: "Contradicted, 2, go to section".
export function chipLabel(bucket, count) {
  const name = String(bucket).charAt(0).toUpperCase() + String(bucket).slice(1);
  return `${name}, ${count}, go to section`;
}

// After a scan, land on the first non-empty bucket among Contradicted, Missing, Unverifiable. null when all three
// are empty (then the status strip gets the focus). Verified is never a landing spot: it is not a problem.
export function firstProblemBucket(counts) {
  return PROBLEM_ORDER.find((b) => (counts?.[b] ?? 0) > 0) ?? null;
}

// No smooth scrolling for people who asked for less motion.
export function scrollBehavior(reducedMotion) {
  return reducedMotion ? 'auto' : 'smooth';
}

// One line of Haiku text for a bucket, or null. Null means show nothing: never a placeholder.
export function bucketNote(report, bucket) {
  const note = report?.notes?.buckets?.[bucket];
  return typeof note === 'string' && note.trim() ? note.trim() : null;
}
