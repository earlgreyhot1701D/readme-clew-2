import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineLink } from '../lib/links.js';

test('root README link', () => {
  assert.equal(
    lineLink({ owner: 'o', name: 'r', readmePath: 'README.md', line: 42 }),
    'https://github.com/o/r/blob/HEAD/README.md?plain=1#L42',
  );
});

test('nested README path keeps its slashes', () => {
  assert.equal(
    lineLink({ owner: 'o', name: 'r', readmePath: 'packages/web/README.md', line: 7 }),
    'https://github.com/o/r/blob/HEAD/packages/web/README.md?plain=1#L7',
  );
});

test('path segments are encoded', () => {
  assert.equal(
    lineLink({ owner: 'o', name: 'r', readmePath: 'my docs/README.md', line: 1 }),
    'https://github.com/o/r/blob/HEAD/my%20docs/README.md?plain=1#L1',
  );
});

test('bad owner, repo, or line throws', () => {
  assert.throws(() => lineLink({ owner: 'o/x', name: 'r', line: 1 }), /owner or repo/);
  assert.throws(() => lineLink({ owner: 'o', name: '', line: 1 }), /owner or repo/);
  assert.throws(() => lineLink({ owner: 'o', name: 'r', line: 0 }), /line number/);
  assert.throws(() => lineLink({ owner: 'o', name: 'r', line: 1.5 }), /line number/);
});
