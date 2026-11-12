// A package name counts as mentioned only when it stands as its own token.
// A name that only appears inside a longer word is not a mention: "ava" inside "javascript",
// "lodash" inside "lodash-es", "can" inside "canvas-parser".
// Found live on sindresorhus/yocto-queue: devDependency `ava` was suppressed because the README
// links to a mozilla URL containing "javascript", so a real Missing finding disappeared silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsWord, verifyDependency } from '../lib/verifiers/dependencies.js';
import { verifyCoverage } from '../lib/verifiers/coverage.js';

// 27 unambiguous rows: [text, name, shouldCountAsMentioned].
// No row here is debatable. "lodash/fp", "lodash.merge" and "ava.js" are omitted on purpose:
// all three answers are arguable, so scoring them would fake a result.
const CASES = [
  ['Tests run with `ava`.', 'ava', true],
  ['Uses ava@6.0.0 for tests', 'ava', true],
  ['npm i --save-dev ava', 'ava', true],
  ['see the Ava library', 'ava', true],
  ['We use ava.', 'ava', true],
  ['We use ava. It is fast.', 'ava', true],
  ['nyc, ava, and mocha', 'ava', true],
  ['- ava', 'ava', true],
  ['(ava)', 'ava', true],
  ['ava!', 'ava', true],
  ['use ava to run tests', 'ava', true],
  ['See ava (the runner)', 'ava', true],
  ['ava\nthe next line', 'ava', true],
  ['mozilla.org/en-us/docs/web/javascript/r', 'ava', false],
  ['we use lodash-es here', 'lodash', false],
  ['a yoga-layout preset', 'yoga', false],
  ['@types/node helper', 'types', false],
  ['@types/node helper', 'node', false],
  ['Run `npm i canvas-parser`', 'can', false],
  ['target audience', 'get', false],
  ['my_ava custom', 'ava', false],
  ['xava here', 'ava', false],
  ['ava2 runner', 'ava', false],
  ['uses Vite-Ava builder', 'ava', false],
  ['', 'ava', false],
  ['anything at all', '', false],
  [' note here', '', false],
];

test('mentionsWord: a name inside a longer word is not a mention, a standalone name is', () => {
  assert.equal(CASES.length, 27);
  for (const [text, name, want] of CASES) {
    assert.equal(mentionsWord(text, name), want, `${JSON.stringify(text)} / ${JSON.stringify(name)}`);
  }
});

const repoWith = (deps, sources) => ({ pkg: { name: 'p', dependencies: deps }, workspaces: [], files: ['package.json'], sources });
const missingNames = (readme, repo) => verifyCoverage(readme, repo).filter((f) => f.bucket === 'missing').map((f) => f.name);

test('coverage: a substring-only mention no longer hides a Missing finding (yocto-queue shape)', () => {
  const repo = repoWith({}, { 'index.js': "import test from 'ava';\n" });

  // The real case: "ava" is only inside "javascript", so `ava` is never mentioned in the README.
  assert.deepEqual(missingNames('See https://mozilla.org/en-us/docs/web/javascript/reference/iteration for the api.', repo), ['ava']);
  // Controls: a standalone mention suppresses it; a README with no mention at all still reports it.
  assert.deepEqual(missingNames('Tests run with `ava`.', repo), []);
  assert.deepEqual(missingNames('No test runner is named here.', repo), ['ava']);
});

test('dependencies: a name inside another package does not become a code claim', () => {
  const repo = repoWith({ express: '^4' }, { 'index.js': "import x from 'express';\n" });
  const bucket = (name, text) => verifyDependency(name, repo, { text, inFence: false }).bucket;

  // "can" inside "canvas-parser" and "lodash" inside "lodash-es" are not on the line as packages,
  // so the prose guard keeps them out of Contradicted (the outcome the guard exists to prevent).
  assert.equal(bucket('can', 'Run `npm i canvas-parser` to start.'), 'unverifiable');
  assert.equal(bucket('lodash', 'Run `npm i lodash-es` instead.'), 'unverifiable');
  // Controls: a real undeclared package on an install line still reaches Contradicted,
  // and a prose word on a line without an install command stays out.
  assert.equal(bucket('leftpad', 'Run `npm i leftpad` to start.'), 'contradicted');
  assert.equal(bucket('can', 'The canvas API draws things.'), 'unverifiable');
});
