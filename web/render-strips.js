// Strips the page and the extension popup both draw: the counts, the status with the clew, and the one-line states.
// Shared on purpose: this file and everything it imports are copied into extension/shared/ by scripts/sync-extension.mjs.
// So it imports nothing page-only (no navigate.js, no download.js). textContent only, via el().
import { el } from './dom.js';
import { chipLabel } from './ui-state.js';
import { statusStrip, bubbleText, clewPose, countChips } from './view-model.js';

export function strip(cls) { return el('section', `strip ${cls ?? ''}`.trim()); }

// A clew picture: square PNG shown at 120 px, with width and height set so the page does not shift when it loads.
export function clewImg(file, mood) {
  return el('img', 'clew', null, { src: `mascot/${file}.png`, alt: `The clew, ${mood}`, width: '120', height: '120' });
}

// The four counts. With onChip each one is a button ("Contradicted, 2, go to section") that calls onChip(bucket).
// Without it (the popup) they are plain boxes, because there is no section to go to.
export function renderCounts(counts, onChip) {
  const s = strip('counts');
  for (const c of countChips(counts)) {
    let chip;
    if (onChip) {
      chip = el('button', `chip b-${c.bucket}`, null, { type: 'button', 'aria-label': chipLabel(c.bucket, c.count) });
      chip.addEventListener('click', () => onChip(c.bucket));
    } else {
      chip = el('div', `chip b-${c.bucket}`, null, { role: 'group', 'aria-label': `${c.label}, ${c.count}` });
    }
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
  row.append(clewImg(pose.file, st.mood), el('p', 'bubble', bubbleText(report)));
  s.append(row);
  return s;
}

// A one-line state strip (idle, loading, errors).
// onRetry (errors only): adds a TRY AGAIN button that calls it. The button is one click and never fires by itself.
export function renderState(root, text, kind, withCursor, onRetry) {
  root.replaceChildren();
  const s = strip(`state s-${kind}`);
  const p = el('p', 'state-text', text, { role: kind === 'error' ? 'alert' : 'status' });
  if (withCursor) p.append(el('span', 'cursor', '\u2588'));
  if (kind === 'idle') { // the first screen has the mascot beside the idle text
    const row = el('div', 'idle-row');
    row.append(clewImg('calm', 'calm'), p);
    s.append(row);
  } else if (kind === 'error' && onRetry) {
    const row = el('div', 'error-row');
    const again = el('button', 'btn btn-small retry', 'TRY AGAIN', { type: 'button' });
    again.addEventListener('click', onRetry);
    row.append(p, again);
    s.append(row);
  } else {
    s.append(p);
  }
  root.append(s);
}
