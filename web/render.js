// DOM rendering for a report. textContent only: every repo-derived string goes through el(). No HTML string sinks.
import { el } from './dom.js';
import { renderSection } from './render-sections.js';
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

export function renderCounts(counts) {
  const s = strip('counts');
  for (const c of countChips(counts)) {
    const chip = el('div', `chip b-${c.bucket}`);
    chip.append(el('span', 'label', c.label), el('span', 'num', String(c.count)));
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
  const img = el('img', pose.rotate ? 'clew rotate' : 'clew', null, { src: `mascot/${pose.file}.svg`, alt: `The clew looks ${st.mood}`, width: '120', height: '120' });
  row.append(img, el('p', 'bubble', bubbleText(report)));
  s.append(row);
  return s;
}

export function renderFooter(report) {
  const s = strip('footer');
  s.append(el('p', 'value', footerText(report)));
  const links = el('div', 'footer-links');
  // Block 6b (M18): wire this to the JSON export. Stub only here, so the button is disabled.
  links.append(el('button', 'btn', 'DOWNLOAD JSON', { type: 'button', disabled: '', title: 'Coming in a later block' }));
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
