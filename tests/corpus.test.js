// The corpus: real public repos frozen at one commit and run through the same pipeline as production.
// Offline, no Jev: this measures the checks that need no model (rule-decided claims plus coverage),
// which is where every Missing finding comes from. Lines the pre-filter leaves to Jev are counted,
// never judged here, so a number in this file is about the deterministic half only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runPipeline } from '../lib/pipeline.js';
import { isJsProject, NOT_JS_MESSAGE } from '../lib/js-repo.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../fixtures/corpus/${p}`, import.meta.url), 'utf8'));
const plain = (x) => JSON.parse(JSON.stringify(x));
const CORPUS = ['chalk-chalk', 'hoppscotch-hoppscotch', 'pallets-flask'];
const keyOf = (f) => `${f.bucket}/${f.claimType}/${f.name ?? '-'}#${f.line ?? 'repo'}`;

// Jev is not part of this corpus: every line the pre-filter does not decide stays undecided.
const noJev = new Proxy({}, { get: () => ({ choice: 'not_a_claim', confidence: 1 }) });

function measure(fixture) {
  const input = read(`repos/${fixture}.json`);
  if (!isJsProject(input.snapshot)) return { input, report: null };
  const report = runPipeline({
    readme: input.readme,
    repo: input.repo,
    snapshot: input.snapshot,
    jev: { labels: noJev, names: noJev },
  });
  report.meta.readmeTruncated = input.truncated === true;
  return { input, report };
}

for (const fixture of CORPUS.filter((f) => !f.startsWith('pallets'))) {
  test(`${fixture}: report equals fixtures/corpus/expected/${fixture}.json`, () => {
    const { report } = measure(fixture);
    assert.deepEqual(plain(report), read(`expected/${fixture}.json`));
  });
}

test('the corpus never produces a Contradicted finding', () => {
  for (const fixture of CORPUS) {
    const { report } = measure(fixture);
    if (report) assert.equal(report.counts.contradicted, 0, fixture);
  }
});

test('flask: a repo without package.json stops before Jev, and says why', () => {
  const { report } = measure('pallets-flask');
  assert.equal(report, null);
  assert.equal(NOT_JS_MESSAGE, 'NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS');
});

test('every finding has an audit verdict, and no verdict is left without a finding', () => {
  for (const fixture of CORPUS) {
    const { report } = measure(fixture);
    const audit = read(`audit/${fixture}.json`);
    const seen = (report?.findings ?? []).map(keyOf).sort();
    const judged = audit.entries.map((e) => e.key).sort();
    assert.deepEqual(judged, seen, fixture);
    for (const e of audit.entries) assert.ok(['correct', 'false', 'no_action'].includes(e.verdict), `${fixture} ${e.key}`);
    // Ratchet at zero: the corpus asked for two false findings (chalk's subpath imports) and they are
    // fixed. The count may go down, never up, so a verdict flipped to "false" breaks this test and
    // scripts/mutation-corpus.mjs keeps biting on the audit file.
    const falseKeys = audit.entries.filter((e) => e.verdict === 'false').map((e) => e.key);
    assert.deepEqual(falseKeys, [], `${fixture} has a false verdict again`);
  }
});

// The fix this corpus asked for: a subpath import is declared in the package's own "imports" map,
// so it must not be reported as a package the project forgot.
test('chalk: package subpath imports are not reported as Missing', () => {
  const { input, report } = measure('chalk-chalk');
  const imports = Object.keys(input.snapshot.pkg.imports ?? {});
  assert.deepEqual(imports.sort(), ['#ansi-styles', '#supports-color']);
  assert.equal(report.findings.filter((f) => (f.name ?? '').startsWith('#')).length, 0);
  assert.equal(report.counts.missing, 0);
});

// The strongest claim this corpus can make today: on a real monorepo every Missing comes from a
// build/test entry point, never from a file the published packages import at runtime.
const HOPPSCOTCH_TOOLING = new Set([
  'packages/codemirror-lang-graphql/rollup.config.js',
  'packages/hoppscotch-agent/eslint.config.mjs',
  'packages/hoppscotch-agent/vite.config.ts',
  'packages/hoppscotch-backend/eslint.config.js',
  'packages/hoppscotch-backend/jest.setup.js',
  'packages/hoppscotch-backend/prisma.config.ts',
  'packages/hoppscotch-cli/setupFiles.ts',
  'packages/hoppscotch-cli/tsup.config.ts',
  'packages/hoppscotch-common/meta.ts',
  'packages/hoppscotch-common/type-check.mjs',
  'tailwind.config.ts',
]);

test('hoppscotch: every Missing comes from a tooling file, none from runtime source', () => {
  const { report } = measure('hoppscotch-hoppscotch');
  const missing = report.findings.filter((f) => f.bucket === 'missing');
  assert.equal(missing.length, 27);
  for (const f of missing) assert.ok(HOPPSCOTCH_TOOLING.has(f.evidence.file), `${f.name} <- ${f.evidence.file}`);
});
