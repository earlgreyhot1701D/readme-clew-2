// AGENTS.md security rule: textContent only, no innerHTML, no eval. Walks web/, extension/ and bookmarklet/.
// A needle inside a comment still fails on purpose: if the word is mentioned, a reviewer should look at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['web', 'extension', 'bookmarklet'];
const CODE = /\.(js|mjs|cjs|html|htm|svg)$/i;
const BAD = [
  [/\binnerHTML\b/, 'innerHTML'], [/\bouterHTML\b/, 'outerHTML'], [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\bdocument\.write(ln)?\s*\(/, 'document.write'], [/\beval\s*\(/, 'eval('], [/\bnew\s+Function\b/, 'new Function'],
  [/\bsetTimeout\s*\(\s*['"`]/, 'setTimeout with a string'], [/\bsetInterval\s*\(\s*['"`]/, 'setInterval with a string'],
  [/\bsrcdoc\s*=/, 'srcdoc'], [/\bDOMParser\b/, 'DOMParser'], [/\bcreateContextualFragment\b/, 'createContextualFragment'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

export function scan(text) {
  return BAD.filter(([re]) => re.test(text)).map(([, label]) => label);
}

test('no file in web/, extension/, or bookmarklet/ uses innerHTML, eval, or another string-to-code or string-to-HTML sink', () => {
  const hits = [];
  let files = 0;
  for (const d of DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      files++;
      for (const label of scan(readFileSync(f, 'utf8'))) hits.push(`${relative(ROOT, f)}: ${label}`);
    }
  }
  assert.ok(files > 0, 'the walk found no files, so the test proves nothing');
  assert.deepEqual(hits, [], `Unsafe DOM use:\n${hits.join('\n')}`);
});

test('the scanner itself catches each banned pattern (so a green run means something)', () => {
  assert.deepEqual(scan('el.innerHTML = x'), ['innerHTML']);
  assert.deepEqual(scan('a.insertAdjacentHTML("beforeend", x)'), ['insertAdjacentHTML']);
  assert.deepEqual(scan('eval(code)'), ['eval(']);
  assert.deepEqual(scan('new Function("return 1")'), ['new Function']);
  assert.deepEqual(scan('document.write("x")'), ['document.write']);
  assert.deepEqual(scan('setTimeout("run()", 1)'), ['setTimeout with a string']);
  assert.deepEqual(scan('el.textContent = x; setTimeout(fn, 1);'), []);
});
