import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, namesFor } from '../lib/candidates.js';

test('finds vite in "Frontend (Vite)"', () => {
  assert.deepEqual(candidates('Frontend (Vite)').packages, ['vite']);
});

test('finds packages after a cue phrase, including a list', () => {
  assert.deepEqual(candidates('Built with Express and better-sqlite3.').packages, ['express', 'better-sqlite3']);
  assert.deepEqual(candidates('We use React for the UI.').packages, ['react']);
});

test('finds backticked commands', () => {
  const c = candidates('Run `npm run dev`, then `node server.js`.');
  assert.deepEqual(c.commands, ['npm run dev', 'node server.js']);
});

test('a fenced command line is its own candidate', () => {
  assert.deepEqual(candidates('$ npm install', { inFence: true }).commands, ['npm install']);
  assert.deepEqual(candidates('npm install').commands, []);
});

test('finds UPPER_SNAKE and process.env names', () => {
  const c = candidates('Set DATABASE_URL and read process.env.PORT.');
  assert.deepEqual(c.envVars.sort(), ['DATABASE_URL', 'PORT']);
});

test('finds paths from links and backticks', () => {
  const c = candidates('See [guide](./docs/guide.md) and `src/index.js`.');
  assert.deepEqual(c.paths, ['./docs/guide.md', 'src/index.js']);
});

test('finds URLs and keeps them out of the other lists', () => {
  const c = candidates('Docs at https://example.com/docs.');
  assert.deepEqual(c.urls, ['https://example.com/docs']);
  assert.deepEqual(c.paths, []);
  assert.deepEqual(c.packages, []);
});

test('finds nothing in plain prose', () => {
  const c = candidates('A small task tracker for solo builders.');
  assert.deepEqual(c, { commands: [], packages: [], envVars: [], paths: [], urls: [] });
});

test('stop words and env tokens are not packages', () => {
  assert.deepEqual(candidates('It uses the cache.').packages, []);
  assert.deepEqual(candidates('Set `API_KEY` first.').packages, []);
});

test('namesFor picks the list for the claim type', () => {
  const c = candidates('Built with Express. See [x](./a.md) at https://e.com/x');
  assert.deepEqual(namesFor(c, 'dependency'), ['express']);
  assert.deepEqual(namesFor(c, 'file_or_url'), ['./a.md', 'https://e.com/x']);
  assert.deepEqual(namesFor(c, 'unverifiable'), []);
});
