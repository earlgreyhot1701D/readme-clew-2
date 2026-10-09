// README text -> numbered lines. Pure. CRLF and LF give the same result.
// Each line: { n (1-based), text (exact, no line ending), inFence, isFence }.
// isFence marks the ``` or ~~~ marker lines themselves. inFence marks lines between markers.
const FENCE = /^\s{0,3}(```|~~~)/;

export function segment(text) {
  const raw = String(text ?? '').split(/\r\n|\r|\n/);
  if (raw[raw.length - 1] === '') raw.pop(); // final newline is not a line (matches GitHub numbering)
  const lines = [];
  let open = null;
  raw.forEach((t, i) => {
    const m = t.match(FENCE);
    const n = i + 1;
    if (m && !open) {
      open = m[1];
      lines.push({ n, text: t, inFence: false, isFence: true });
    } else if (m && m[1] === open) {
      open = null;
      lines.push({ n, text: t, inFence: false, isFence: true });
    } else {
      lines.push({ n, text: t, inFence: open !== null, isFence: false });
    }
  });
  return lines;
}
