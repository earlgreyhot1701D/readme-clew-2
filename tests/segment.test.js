import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../lib/segment.js';

test('line numbers match the source', () => {
  const lines = segment('first\nsecond\n\nfourth\n');
  assert.deepEqual(lines.map((l) => l.n), [1, 2, 3, 4]);
  assert.deepEqual(lines.map((l) => l.text), ['first', 'second', '', 'fourth']);
});

test('code-fence lines are kept and marked', () => {
  const lines = segment('intro\n```bash\nnpm install\n```\noutro');
  assert.deepEqual(lines.map((l) => l.text), ['intro', '```bash', 'npm install', '```', 'outro']);
  assert.deepEqual(lines.map((l) => l.inFence), [false, false, true, false, false]);
  assert.deepEqual(lines.map((l) => l.isFence), [false, true, false, true, false]);
});

test('CRLF and LF give the same result', () => {
  const lf = 'a\n```\nb\n```\nc\n';
  const crlf = lf.replaceAll('\n', '\r\n');
  assert.deepEqual(segment(crlf), segment(lf));
});

test('an empty README gives no lines', () => {
  assert.deepEqual(segment(''), []);
});

test('an unclosed fence keeps every later line inFence', () => {
  const lines = segment('```\nnpm start\nmore');
  assert.deepEqual(lines.map((l) => l.inFence), [false, true, true]);
});
