// The bookmarklet only navigates. Run its real source against a fake location; fetch and XMLHttpRequest do not exist in the sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { expectedOutput } from '../scripts/build-bookmarklet.mjs';
import { BOOKMARKLET_HREF } from '../web/bookmarklet-href.js';

const SRC = readFileSync(new URL('../bookmarklet/bookmarklet.js', import.meta.url), 'utf8');
const BASE = 'https://readme-clew-2.vercel.app/';

function run(source, hostname, pathname) {
  const location = { hostname, pathname, href: 'unchanged' };
  vm.runInNewContext(source, { location });
  return location.href;
}

test('bookmarklet: a GitHub repo page opens the site with ?repo=owner/name', () => {
  assert.equal(run(SRC, 'github.com', '/lukeed/polka'), `${BASE}?repo=lukeed/polka`);
  assert.equal(run(SRC, 'github.com', '/lukeed/polka/tree/main/examples'), `${BASE}?repo=lukeed/polka`);
});

test('bookmarklet: not a repo page opens the site with no repo', () => {
  assert.equal(run(SRC, 'github.com', '/'), BASE);
  assert.equal(run(SRC, 'github.com', '/lukeed'), BASE);
  assert.equal(run(SRC, 'example.com', '/lukeed/polka'), BASE);
});

test('bookmarklet: the shipped link is the built source, and it works from the link text', () => {
  assert.equal(readFileSync(new URL('../web/bookmarklet-href.js', import.meta.url), 'utf8'), expectedOutput());
  assert.ok(BOOKMARKLET_HREF.startsWith('javascript:'));
  assert.equal(run(decodeURI(BOOKMARKLET_HREF.slice('javascript:'.length)), 'github.com', '/o/r'), `${BASE}?repo=o/r`);
});

test('bookmarklet: no network, storage, or eval in the source', () => {
  const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /fetch|XMLHttpRequest|sendBeacon|WebSocket|eval|innerHTML|localStorage|document\./);
});
