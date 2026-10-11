// Moving the reader to a section: count chips, and the landing spot after a scan.
import { sectionId, firstProblemBucket, scrollBehavior } from './ui-state.js';

function reduced(win) {
  return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function reveal(el, win) {
  el.scrollIntoView({ behavior: scrollBehavior(reduced(win)), block: 'start' });
  el.focus({ preventScroll: true }); // the scroll above already moved the page
}

// Opens the bucket's section if it is closed (open: true), scrolls to it, and focuses its header button.
export function goToSection(bucket, { open = true, doc = document, win = window } = {}) {
  const id = sectionId(bucket);
  const head = id ? doc.querySelector(`button.acc-head[aria-controls="${id}"]`) : null;
  if (!head) return false;
  if (open && head.getAttribute('aria-expanded') !== 'true') head.click();
  reveal(head, win);
  return true;
}

// After a scan renders: first non-empty of Contradicted, Missing, Unverifiable. If all three are empty, the status strip.
// A closed section stays closed: the defaults decide what is open, and focus on the header is enough.
export function landAfterScan(counts, { doc = document, win = window } = {}) {
  const bucket = firstProblemBucket(counts);
  if (bucket) return goToSection(bucket, { open: false, doc, win });
  const status = doc.querySelector('.status-fill');
  if (!status) return false;
  status.tabIndex = -1; // a status strip is not a control, so it only takes focus from code
  reveal(status, win);
  return true;
}
