// DOM rendering for a full report on the page. textContent only: every repo-derived string goes through el().
// The strips the popup also draws (counts, status, states) live in render-strips.js.
import { el } from './dom.js';
import { renderSection } from './render-sections.js';
import { goToSection } from './navigate.js';
import { downloadReport } from './download.js';
import { renderCounts, renderStatus, renderState, strip } from './render-strips.js';
import { bucketSections, recordFields, footerText } from './view-model.js';

export { renderCounts, renderStatus, renderState };

export function renderRecord(report) {
  const s = strip('record');
  s.append(el('h2', 'strip-title', 'RECORD'));
  const grid = el('div', 'fields');
  for (const f of recordFields(report)) {
    const box = el('div', 'field');
    box.append(el('span', 'label', f.label), el('span', 'value', f.value));
    grid.append(box);
  }
  s.append(grid);
  return s;
}

export function renderFooter(report) {
  const s = strip('footer');
  s.append(el('p', 'value', footerText(report)));
  const links = el('div', 'footer-links');
  // M18: saves this exact report object as a .json file on this machine. The button only exists once a report does.
  const save = el('button', 'btn', 'DOWNLOAD JSON', { type: 'button' });
  save.addEventListener('click', () => downloadReport(report));
  links.append(save);
  // Opens the ABOUT tab, where the limits are written down (tabs.js handles data-goto-tab).
  links.append(el('button', 'linkbtn', 'HONEST LIMITATIONS', { type: 'button', 'data-goto-tab': 'about' }));
  s.append(links);
  return s;
}

// Fills the report root. Strips appear top to bottom (the stagger is CSS, off under reduced motion).
// Each count chip is a button: it opens its section if closed, scrolls there, and focuses the section header.
export function renderReport(report, root) {
  root.replaceChildren();
  const parts = [renderRecord(report), renderCounts(report.counts, (bucket) => goToSection(bucket)), renderStatus(report),
    ...bucketSections(report).map(renderSection), renderFooter(report)];
  parts.forEach((p, i) => { p.style.setProperty('--i', String(i)); root.append(p); });
}
