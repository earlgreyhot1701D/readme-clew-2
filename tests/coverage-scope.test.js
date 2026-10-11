// Coverage ignores imports that say nothing about the project's own dependencies (found live on lukeed/polka).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCoverage } from '../lib/verifiers/coverage.js';
import { runFixture } from './helpers.js';
import { STATES } from '../web/view-model.js';

const repo = (sources, files = [], workspaces = []) => ({ pkg: { name: 'p' }, workspaces, files: ['package.json', ...files], sources });
const names = (r) => verifyCoverage('nothing', r).map((m) => m.name);

test('coverage: imports under example/test/docs style folders are ignored, at any depth', () => {
  for (const dir of ['examples', 'example', 'demo', 'demos', 'test', 'tests', '__tests__', 'fixtures', 'docs', 'packages/a/examples']) {
    assert.deepEqual(names(repo({ [`${dir}/x.js`]: "import a from 'zed';" })), [], dir);
  }
  assert.deepEqual(names(repo({ 'src/x.js': "import a from 'zed';" })), ['zed']);
  assert.deepEqual(names(repo({ 'latest/x.js': "import a from 'zed';" })), ['zed']); // "test" inside a longer name is not a test folder
});

test('coverage: a file under a folder with an unread package.json is ignored; a read workspace still counts', () => {
  const sub = repo({ 'tools/h/i.js': "import a from 'zed';" }, ['tools/h/package.json']);
  assert.deepEqual(names(sub), []);
  const read = repo({ 'tools/h/i.js': "import a from 'zed';" }, ['tools/h/package.json'], [{ path: 'tools/h', pkg: { name: 'h' } }]);
  assert.deepEqual(names(read), ['zed']);
  const nested = repo({ 'tools/h/deep/i.js': "import a from 'zed';" }, ['tools/h/package.json']);
  assert.deepEqual(names(nested), []);
});

test('polka regression: only the real root import is Missing', () => {
  const { report } = runFixture('polka-examples');
  assert.deepEqual(report.findings.filter((f) => f.bucket === 'missing').map((f) => f.name), ['trouter']);
});

test('bad input wording', () => {
  assert.equal(STATES.badInput, 'NOT A GITHUB REPO // USE owner/repo OR https://github.com/owner/repo');
});
