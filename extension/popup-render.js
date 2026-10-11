// The compact report in the popup: counts, status with the clew, the top 3 rows, then the actions.
// It reuses the page's own renderers (shared/), so a row looks the same here and on the site. textContent only, via el().
import { el } from './shared/dom.js';
import { renderCounts, renderStatus, strip } from './shared/render-strips.js';
import { renderRow } from './shared/render-sections.js';
import { downloadReport } from './shared/download.js';
import { deepLink } from './shared/site.js';
import { popupRows, FULL_REPORT_NOTE } from './popup-model.js';

function rowsStrip(p) {
  const s = strip(`bucket b-${p.bucket}`);
  s.append(el('h2', 'strip-title', p.heading));
  const list = el('div', 'rows-list');
  for (const r of p.shown) list.append(renderRow(r));
  s.append(list);
  if (p.hidden > 0) s.append(el('p', 'more', `+${p.hidden} MORE IN THE FULL REPORT`));
  return s;
}

// OPEN FULL REPORT is a plain link to the site with ?repo= filled in. DOWNLOAD JSON saves this report, so no second scan is needed.
function actionsStrip(report) {
  const s = strip('actions');
  const row = el('div', 'footer-links');
  const href = deepLink(`${report.repo.owner}/${report.repo.name}`);
  row.append(el('a', 'btn', 'OPEN FULL REPORT', { href, target: '_blank', rel: 'noopener noreferrer' }));
  const save = el('button', 'btn', 'DOWNLOAD JSON', { type: 'button' });
  save.addEventListener('click', () => downloadReport(report));
  row.append(save);
  s.append(row, el('p', 'hint', FULL_REPORT_NOTE));
  return s;
}

export function renderPopupReport(report, root) {
  root.replaceChildren();
  const rows = popupRows(report);
  const parts = [renderCounts(report.counts), renderStatus(report)];
  if (rows.bucket) parts.push(rowsStrip(rows));
  parts.push(actionsStrip(report));
  parts.forEach((p, i) => { p.style.setProperty('--i', String(i)); root.append(p); });
}
