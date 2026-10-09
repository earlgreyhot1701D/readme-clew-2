import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefilter } from '../lib/prefilter.js';

const L = (text, extra = {}) => ({ n: 1, text, inFence: false, isFence: false, ...extra });
const label = (line) => prefilter(line)?.label ?? null;

test('empty line, horizontal rule, HTML comment -> not_a_claim', () => {
  assert.equal(label(L('')), 'not_a_claim');
  assert.equal(label(L('   ')), 'not_a_claim');
  assert.equal(label(L('---')), 'not_a_claim');
  assert.equal(label(L('* * *')), 'not_a_claim');
  assert.equal(label(L('<!-- note to self -->')), 'not_a_claim');
});

test('heading with no backticks -> not_a_claim; heading with backticks stays undecided', () => {
  assert.equal(label(L('## Installation')), 'not_a_claim');
  assert.equal(label(L('## Run `npm start`')), null);
});

test('badge or image markdown only -> not_a_claim', () => {
  assert.equal(label(L('[![Build](https://img.shields.io/x.svg)](https://ci.example.com)')), 'not_a_claim');
  assert.equal(label(L('![logo](./logo.png)')), 'not_a_claim');
  assert.equal(label(L('Text with ![logo](./logo.png) inside')), null);
});

test('fenced line starting with a package manager -> command', () => {
  for (const cmd of ['npm install', 'pnpm dev', 'yarn start', 'npx vite', 'node server.js', 'bun run build', '$ npm test']) {
    assert.equal(label(L(cmd, { inFence: true })), 'command', cmd);
  }
});

test('the same command outside a fence stays undecided', () => {
  assert.equal(label(L('npm install')), null);
});

test('process.env.X or a backticked UPPER_SNAKE token -> env_var', () => {
  assert.equal(label(L('Reads process.env.PORT at start.')), 'env_var');
  assert.equal(label(L('Set `DATABASE_URL` first.')), 'env_var');
});

test('a backticked word without an underscore is not an env var', () => {
  assert.equal(label(L('Edit the `README` file.')), null);
});

test('a line that is only a relative link -> file_or_url', () => {
  assert.equal(label(L('[Guide](./docs/guide.md)')), 'file_or_url');
  assert.equal(label(L('- [Guide](../docs/guide.md)')), 'file_or_url');
});

test('a relative link inside a sentence stays undecided', () => {
  assert.equal(label(L('See [Guide](./docs/guide.md) for more.')), null);
});

test('fence marker lines are never claims', () => {
  assert.equal(label(L('```bash', { isFence: true })), 'not_a_claim');
});

test('ordinary prose stays undecided', () => {
  assert.equal(prefilter(L('We use React for the UI.')), null);
  assert.equal(prefilter(L('Blazingly fast.')), null);
});
