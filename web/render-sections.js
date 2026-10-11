// Finding rows and the four bucket sections. Each section is a disclosure: a header button with the count and
// aria-expanded. Rows are built only when a section is first opened, and only the first ROW_LIMIT at first.
// textContent only (via el()).
import { el } from './dom.js';
import { bindDisclosure } from './disclosure.js';
import { ROW_LIMIT, visibleRows, showAllLabel } from './ui-state.js';

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

// The rows of one open section: the first ROW_LIMIT, then SHOW ALL N for the rest.
function fillRows(body, sec) {
  if (sec.empty) { body.append(el('p', 'none', 'NONE FOUND')); return; }
  const list = el('div', 'rows-list');
  const { shown, hiddenCount } = visibleRows(sec.rows);
  for (const r of shown) list.append(renderRow(r));
  body.append(list);
  if (hiddenCount === 0) return;
  const more = el('button', 'btn show-all', showAllLabel(sec.count), { type: 'button' });
  more.addEventListener('click', () => {
    const rest = sec.rows.slice(ROW_LIMIT).map(renderRow);
    list.append(...rest);
    more.remove();
    rest[0].tabIndex = -1; // keep keyboard focus where the new rows start
    rest[0].focus();
  });
  body.append(more);
}

export function renderSection(sec) {
  const s = el('section', `strip bucket b-${sec.bucket}`);
  const id = `sec-${sec.bucket}`;
  const head = el('h2', 'strip-title');
  const btn = el('button', 'acc-head', null, { type: 'button', 'aria-controls': id });
  const body = el('div', 'rows', null, { id });
  let built = false;
  head.append(btn);
  s.append(head, body);
  bindDisclosure(btn, body, {
    open: sec.open,
    onToggle: (open) => {
      btn.textContent = `${sec.label} (${sec.count})  [${open ? 'HIDE' : 'SHOW'}]`;
      if (open && !built) { built = true; fillRows(body, sec); } // closed sections cost nothing until opened
    },
  });
  return s;
}
