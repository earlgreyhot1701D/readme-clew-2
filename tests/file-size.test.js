// Enforces the AGENTS.md rule: no file over 200 lines in api/, lib/, web/, extension/, bookmarklet/.
// Fixtures, tests, and docs are exempt. Do not raise the cap or add exemptions without the owner's approval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CAPPED_DIRS = ['api', 'lib', 'web', 'extension', 'bookmarklet'];
const TEXT_EXT = /\.(js|mjs|cjs|html|css|json)$/i;
const MAX_LINES = 200;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
  return out;
}

function lineCount(file) {
  const text = readFileSync(file, 'utf8');
  if (text === '') return 0;
  const parts = text.split(/\r\n|\r|\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

test(`no capped file is over ${MAX_LINES} lines`, () => {
  const tooLong = [];
  for (const d of CAPPED_DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const n = lineCount(file);
      if (n > MAX_LINES) tooLong.push(`${relative(ROOT, file)}: ${n} lines`);
    }
  }
  assert.deepEqual(tooLong, [], `Over the ${MAX_LINES}-line cap. Propose a split:\n${tooLong.join('\n')}`);
});
