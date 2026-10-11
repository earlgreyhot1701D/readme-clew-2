// DOM rendering for a report. textContent only: every repo-derived string goes through el(). No HTML string sinks.
import { el } from './dom.js';
import { renderSection } from './render-sections.js';
import { goToSection } from './navigate.js';
import { downloadReport } from './download.js';
import { chipLabel } from './ui-state.js';
import { statusStrip, bubbleText, clewPose, bucketSections, countChips, recordFields, footerText } from './view-model.js';

function strip(cls) { return el('section', `strip ${cls ?? ''}`.trim()); }

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

// Each count chip is a button: it opens its section if closed, scrolls there, and focuses the section header.
export function renderCounts(counts) {
  const s = strip('counts');
  for (const c of countChips(counts)) {
    const chip = el('button', `chip b-${c.bucket}`, null, { type: 'button', 'aria-label': chipLabel(c.bucket, c.count) });
    chip.append(el('span', 'label', c.label), el('span', 'num', String(c.count)));
    chip.addEventListener('click', () => goToSection(c.bucket));
    s.append(chip);
  }
  return s;
}

export function renderStatus(report) {
  const st = statusStrip(report.mood, report.counts);
  const pose = clewPose(report.mood, report.tilt);
  const s = strip('status');
  s.append(el('div', `status-fill m-${st.mood}`, st.text, { role: 'status' }));
  const row = el('div', 'clew-row');
  // Square PNGs shown at 120 px. width and height are set, so the page does not shift when the picture loads.
  const img = el('img', 'clew', null, { src: `mascot/${pose.file}.png`, alt: `The clew, ${st.mood}`, width: '120', height: '120' });
  row.append(img, el('p', 'bubble', bubbleText(report)));
  s.append(row);
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
export function renderReport(report, root) {
  root.replaceChildren();
  const parts = [renderRecord(report), renderCounts(report.counts), renderStatus(report), ...bucketSections(report).map(renderSection), renderFooter(report)];
  parts.forEach((p, i) => { p.style.setProperty('--i', String(i)); root.append(p); });
}

// A one-line state strip (idle, loading, errors).
export function renderState(root, text, kind, withCursor) {
  root.replaceChildren();
  const s = strip(`state s-${kind}`);
  const p = el('p', 'state-text', text, { role: kind === 'error' ? 'alert' : 'status' });
  if (withCursor) p.append(el('span', 'cursor', '\u2588'));
  s.append(p);
  root.append(s);
}
