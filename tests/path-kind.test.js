// One path policy for both questions: what coverage may read, and what counts as shipped code.
// The cases below are the failure modes that matter: capital letters, folder names that only look
// like test folders, and folders that are tooling without saying so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNonSourceImportSite, isShippedSource, isConfigFile, isHiddenFolder, isTypeTest } from '../lib/path-kind.js';

test('path-kind: coverage ignores folders that demonstrate or test a package, whatever the case', () => {
  for (const file of ['tests/x.js', 'TEST/x.js', 'Tests/x.js', 'examples/x.js', 'Examples/x.js', 'demo/x.js',
    'fixtures/x.js', '__tests__/x.js', 'docs/x.js', 'benchmarks/x.js', 'bench/x.js', 'packages/a/tests/x.js', '@types/x.d.ts']) {
    assert.equal(isNonSourceImportSite(file), true, file);
  }
});

test('path-kind: a folder that only looks like a test folder is still source', () => {
  for (const file of ['src/x.js', 'SRC/x.js', 'src-test/x.js', 'apps/web/src/x.js', 'mytests/x.js', 'tests2/x.js', 'latest/x.js']) {
    assert.equal(isNonSourceImportSite(file), false, file);
  }
});

test('path-kind: shipped source excludes tooling folders, configs and hidden directories', () => {
  for (const file of ['src/index.js', 'lib/a.ts', 'packages/ui/src/App.vue', 'src-test/x.js', 'latest/x.js']) {
    assert.equal(isShippedSource(file), true, file);
  }
  for (const file of ['tests/x.js', 'scripts/build.js', 'tools/x.ts', 'examples/x.js', 'docs/x.md.js', 'bench/x.js',
    'gulpfile.js', 'Gulpfile.ts', 'Makefile.js', 'jest.config.js', '.eslintrc.cjs',
    'vitest.setup.ts', 'src/index.test.ts', '.storybook/main.ts', '.dumi/theme/plugins/x.ts', '.github/actions/x.js']) {
    assert.equal(isShippedSource(file), false, file);
  }
});

test('path-kind: a dotfile at the root is a config, not a hidden folder', () => {
  assert.equal(isHiddenFolder('.eslintrc.js'), false);
  assert.equal(isConfigFile('.eslintrc.js'), true);
  assert.equal(isShippedSource('.prettierrc.cjs'), false);
  assert.equal(isHiddenFolder('src/.cache/x.js'), true);
});

test('path-kind: the two policies differ on purpose and the difference is named', () => {
  // coverage reads scripts, because a build script's imports still say something about the project.
  assert.equal(isNonSourceImportSite('scripts/build.js'), false);
  assert.equal(isShippedSource('scripts/build.js'), false);
  // @types is not a package's runtime, but a file under it is still not shipped code.
  assert.equal(isNonSourceImportSite('@types/x.d.ts'), true);
  assert.equal(isShippedSource('@types/x.d.ts'), true);
});

test('path-kind: a type test is neither a dependency nor shipped code', () => {
  assert.equal(isTypeTest('src/index.test-d.ts'), true);
  assert.equal(isTypeTest('src/index.ts'), false);
});

test('path-kind: a dotfile is tooling, at the root and inside a workspace', () => {
  // Measured on the frozen corpus, which is not part of this tree: size-limit is imported from
  // .size-limit.ts and lodash-doc-globals from .markdown-doctest-setup.js. Neither name matches a
  // config pattern and both are build tooling.
  assert.equal(isShippedSource('.size-limit.ts'), false);
  assert.equal(isShippedSource('.markdown-doctest-setup.js'), false);
  // A workspace has its own root, and a dotfile there is the same kind of file.
  assert.equal(isShippedSource('packages/ui/.size-limit.ts'), false);
  // A name that merely contains a dot is ordinary source, at any depth.
  assert.equal(isShippedSource('size-limit.ts'), true);
  assert.equal(isShippedSource('packages/ui/size-limit.ts'), true);
  // The rule cannot see a package entry point named with a leading dot, because it does not read main,
  // bin or exports. That limit is stated in lib/path-kind.js; the corpus has no such package.
});

test('path-kind: a backslash path is not split into segments', () => {
  // GitHub's tree API uses "/", so this is a limit rather than a supported input. A folder rule cannot
  // match at all, and a file-name rule can match across a backslash, so the outcome is approximate.
  assert.equal(isShippedSource('src\\jest.config.js'), false);
  assert.equal(isShippedSource('src\\index.js'), true);
  assert.equal(isShippedSource('docs\\a.js'), true);
  assert.equal(isShippedSource('jest.config.js\\src\\index.js'), false);
  assert.equal(isShippedSource('packages\\ui\\.size-limit.ts'), true);
});

test('path-kind: control characters cannot dodge a rule', () => {
  // GitHub paths never contain them, but a hostile string must not turn a config into shipped code.
  assert.equal(isShippedSource('jest.config.js\u0000'), false);
  assert.equal(isShippedSource('tests/x.js\u0000'), false);
  assert.equal(isShippedSource('src/index.js\u0000'), true);
});
