// DOM rendering for a report. textContent only: every repo-derived string goes through el(). No HTML string sinks.
import { statusStrip, bubbleText, clewPose, bucketSections, countChips, recordFields, footerText } from './view-model.js';

export function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

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
  const bubble = el('p', 'bubble', bubbleText(report));
  row.append(img, bubble);
  s.append(row);
  return s;
}

export function renderRow(r) {
  const row = el('article', `finding b-${r.bucket}`);
  const top = el('div', 'finding-top');
  const where = r.link ? el('a', 'lineno', `${r.lineLabel} \u2197`, { href: r.link, target: '_blank', rel: 'noopener noreferrer' }) : el('span', 'lineno', r.lineLabel);
  top.append(where, el('span', 'meta', `${r.typeLabel}  //  ${r.decidedLabel}`));
  row.append(top, el('pre', r.isQuote ? 'quote' : 'quote name', r.headline));
  if (r.evidence) {
    const ev = el('p', 'evidence');
    ev.append(el('span', 'label', 'EVIDENCE'), el('span', 'value', ` ${r.evidence}`));
    row.append(ev);
  }
  if (r.showConfidence) {
    const conf = el('div', 'conf');
    const track = el('span', 'track', null, { role: 'img', 'aria-label': `Jev confidence ${r.confidence}` });
    const fill = el('span', 'fill');
    fill.style.width = `${r.confidencePct}%`; // CSSOM, allowed under style-src 'self'
    track.append(fill);
    conf.append(el('span', 'label', 'JEV CONFIDENCE'), track, el('span', 'value', r.confidence));
    row.append(conf);
  }
  if (r.unsure) row.append(el('p', 'unsure', "JEV WASN'T SURE"));
  return row;
}

export function renderSection(sec) {
  const s = strip(`bucket b-${sec.bucket}`);
  const head = sec.collapsed
    ? el('button', 'strip-title toggle', `${sec.label} (${sec.count})  [SHOW]`, { type: 'button', 'aria-expanded': 'false' })
    : el('h2', 'strip-title', `${sec.label} (${sec.count})`);
  s.append(head);
  const body = el('div', 'rows');
  if (sec.empty) body.append(el('p', 'none', 'NONE FOUND'));
  for (const r of sec.rows) body.append(renderRow(r));
  if (sec.collapsed) {
    body.hidden = true;
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', String(!body.hidden));
      head.textContent = `${sec.label} (${sec.count})  [${body.hidden ? 'SHOW' : 'HIDE'}]`;
    });
  }
  s.append(body);
  return s;
}

export function renderFooter(report) {
  const s = strip('footer');
  s.append(el('p', 'value', footerText(report)));
  const links = el('div', 'footer-links');
  // Block 6b (M18): wire this to the JSON export. Stub only here, so the button is disabled.
  links.append(el('button', 'btn', 'DOWNLOAD JSON', { type: 'button', disabled: '', title: 'Coming in a later block' }));
  links.append(el('a', 'lineno', 'HONEST LIMITATIONS', { href: 'https://github.com/earlgreyhot1701D/readme-clew-2#honest-limitations', target: '_blank', rel: 'noopener noreferrer' }));
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
