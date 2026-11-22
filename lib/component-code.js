// The code inside a component: the <script> blocks of a .vue or .svelte file.
//
// A component's template is markup, so an import written there is not code. The block ends at the first
// </script> that is not inside a string: ending at a quoted tag, as the old regex did, lost every import
// after it. Measured on the corpus: 0 of 1228 components contain a quoted closing tag, so the fix changes
// no current finding, and the synthetic case is pinned by a test.
//
// Limit: a regex literal containing </script> still ends the block early, because this scanner does not
// know regex literals apart from strings.

export function scriptOf(text) {
  const src = String(text ?? '');
  const blocks = [];
  let i = 0;
  while (i < src.length) {
    const open = src.toLowerCase().indexOf('<script', i);
    if (open === -1) break;
    const gt = src.indexOf('>', open);
    if (gt === -1) break;
    if (src[gt - 1] === '/') { i = gt + 1; continue; } // <script ... />
    let j = gt + 1;
    let quote = null;
    let end = -1;
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === '\\') { j += 2; continue; }
        if (c === quote) quote = null;
        j += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; j += 1; continue; }
      if (/^<\/script\s*>/i.test(src.slice(j, j + 12))) { end = j; break; }
      j += 1;
    }
    if (end === -1) break; // unclosed: no body
    blocks.push(src.slice(gt + 1, end));
    const close = src.indexOf('>', end);
    if (close === -1) break;
    i = close + 1;
  }
  return blocks.length ? blocks.join('\n') : '';
}
