// What the popup shows under the status strip. Pure, so a test can pin it.
// Top 3 Contradicted. If there are none, the top 3 Missing under their own heading. If both are empty, nothing.
import { bucketSections } from './shared/view-model.js';

export const POPUP_ROWS = 3;

// -> { bucket, label, total, shown, hidden, heading } ; bucket is null when there is nothing to show.
export function popupRows(report) {
  const [contradicted, missing] = bucketSections(report); // the order is Contradicted, Missing, Unverifiable, Verified
  const pick = contradicted.count > 0 ? contradicted : missing.count > 0 ? missing : null;
  if (!pick) return { bucket: null, label: null, total: 0, shown: [], hidden: 0, heading: null };
  const shown = pick.rows.slice(0, POPUP_ROWS);
  const hidden = pick.count - shown.length;
  const heading = hidden > 0 ? `${pick.label} (${shown.length} OF ${pick.count})` : `${pick.label} (${pick.count})`;
  return { bucket: pick.bucket, label: pick.label, total: pick.count, shown, hidden, heading };
}

// The note under OPEN FULL REPORT. The site never scans on load, so the full ledger needs one more click there.
export const FULL_REPORT_NOTE = 'OPENS THE SITE. PRESS SCAN FOR THE FULL LEDGER.';

// Texts for the two states before a scan.
export const POPUP_TEXT = {
  ready: 'PRESS SCAN TO CHECK THIS REPO',
  notRepo: 'OPEN A GITHUB REPO PAGE, THEN CLICK THE CLEW',
};
