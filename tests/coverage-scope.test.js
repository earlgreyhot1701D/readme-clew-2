// Coverage ignores imports that say nothing about the project's own dependencies (found live on lukeed/polka).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCoverage } from '../lib/verifiers/coverage.js';
import { runFixture } from './helpers.js';
import { STATES } from '../web/view-model.js';

const repo = (sources, files = [], workspaces = []) => ({ pkg: { name: 'p' }, workspaces, files: ['package.json', ...files], sources });
const names = (r) => verifyCoverage('nothing', r).map((m) => m.name);

// A .vue/.svelte file: only <script> is code, and a specifier that resolves inside the repo
// (workspace package or tsconfig alias) says nothing about what the README should declare.
test('coverage: a single-file component is read through its script block, and aliases are local', () => {
  const app = '<template><p>import fake from "template-text"</p></template>\n<script setup>import { ref } from "vue";\nimport i18n from "@composables/i18n";\n</script>';
  const plain = { ...repo({ 'packages/ui/src/App.vue': app }, ['packages/ui/src/composables/i18n.ts']) };
  // Without alias knowledge the local name looks like a package. That is what the two cases below fix.
  assert.deepEqual(names(plain), ['vue', '@composables/i18n']);

  const withAlias = {
    ...plain,
    files: [...plain.files, 'packages/ui/tsconfig.json'],
    tsconfigs: { 'packages/ui/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@composables/*': ['./src/composables/*'] } } }) },
  };
  const out = verifyCoverage('nothing', withAlias);
  assert.deepEqual(out.map((m) => m.name), ['vue']);
  assert.equal(out[0].evidence.file, 'packages/ui/src/App.vue');

  // A workspace package name is local, with or without a subpath.
  const wsRepo = repo(
    { 'packages/ui/src/x.ts': "import a from '@app/ui';\nimport b from '@app/ui/themes.css';\nimport c from 'lodash';" },
    ['packages/ui/package.json'],
    [{ path: 'packages/ui', pkg: { name: '@app/ui' } }],
  );
  assert.deepEqual(names(wsRepo), ['lodash']);
});

// A bundle-only alias is local too. Found live on mydraft-cc/ui: `@app` is defined in vite.config.ts,
// not in tsconfig, and three findings named @app/* until the map was read.
test('coverage: a bundler alias makes its specifiers local', () => {
  const src = { 'src/app.ts': "import a from '@app/core';\nimport b from 'vue';\n", 'src/core.ts': 'export default 1;\n' };
  const plain = repo(src, ['src/app.ts', 'src/core.ts']);
  assert.deepEqual(names(plain), ['@app/core', 'vue']);

  const withBundler = { ...plain, bundlerAliases: [{ prefix: '@app', target: 'src', dir: '' }] };
  const out = verifyCoverage('nothing', withBundler);
  assert.deepEqual(out.map((m) => m.name), ['vue']);
});

test('coverage: imports under example/test/docs style folders are ignored, at any depth', () => {
  for (const dir of ['examples', 'example', 'demo', 'demos', 'test', 'tests', '__tests__', 'fixtures', 'docs', 'benchmark', 'benchmarks', 'bench', 'benches', 'packages/a/examples']) {
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

test('coverage: type tests are not source', () => {
  for (const file of ['@types/index.test-d.ts', 'src/index.test-d.ts', 'types/x.test-d.ts']) {
    assert.deepEqual(names(repo({ [file]: "import a from 'tsd';" })), [], file);
  }
  assert.deepEqual(names(repo({ 'src/index.ts': "import a from 'tsd';" })), ['tsd']);
});
