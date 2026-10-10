// Fixture tests: README + fake repo + mocked Jev answers -> full report, compared to fixtures/expected/.
// Offline. The expected files were written by hand from the intent of each fixture, then checked against the output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, runFixture } from './helpers.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const byQuote = (report, text) => report.findings.find((f) => f.quote === text);

for (const name of FIXTURES) {
  test(`${name}: report equals fixtures/expected/${name}.json`, () => {
    const { report, expected } = runFixture(name);
    assert.ok(expected, 'expected file is missing');
    assert.deepEqual(plain(report), expected);
  });
}

test('every finding has evidence and decidedBy; every non-Missing finding has a quote', () => {
  for (const name of FIXTURES) {
    for (const f of runFixture(name).report.findings) {
      assert.ok(f.evidence && typeof f.evidence.detail === 'string', name);
      assert.ok(['rule', 'jev'].includes(f.decidedBy), name);
      if (f.bucket !== 'missing') assert.equal(typeof f.quote, 'string', name);
    }
  }
});

test('clean-minimal: everything is Verified', () => {
  const { report } = runFixture('clean-minimal');
  assert.deepEqual(report.counts, { verified: 5, unverifiable: 0, missing: 0, contradicted: 0 });
  assert.equal(report.mood, 'calm');
});

test('npm-start-drift: npm start is the headline Contradicted case', () => {
  const { report } = runFixture('npm-start-drift');
  const f = byQuote(report, 'npm start');
  assert.equal(f.bucket, 'contradicted');
  assert.equal(f.evidence.detail, 'scripts has start:prod, no start');
  assert.equal(f.decidedBy, 'rule');
  assert.equal(report.mood, 'tangled');
});

test('frontend-vite: the v1 false positive is not Contradicted', () => {
  const { report } = runFixture('frontend-vite');
  assert.equal(report.counts.contradicted, 0);
  assert.equal(byQuote(report, 'Frontend (Vite)').bucket, 'verified');
  const webpack = byQuote(report, 'We also use Webpack for bundling.');
  assert.equal(webpack.bucket, 'unverifiable');
  assert.equal(webpack.lowConfidence, true);
  assert.equal(report.tilt, true);
});

test('envvar-unread: a variable no code reads is Contradicted', () => {
  const { report } = runFixture('envvar-unread');
  assert.equal(byQuote(report, 'Set `DATABASE_URL` to your database.').bucket, 'contradicted');
  assert.equal(byQuote(report, 'Set `LOG_LEVEL` to change logging.').bucket, 'verified');
});

test('missing-package: an imported package the README skips is Missing', () => {
  const { report } = runFixture('missing-package');
  const m = report.findings.filter((f) => f.bucket === 'missing');
  assert.deepEqual(m.map((f) => f.name), ['lodash']);
  assert.equal(report.mood, 'worried');
});

test('marketing-claims: all Unverifiable, none Contradicted', () => {
  const { report } = runFixture('marketing-claims');
  assert.deepEqual(report.counts, { verified: 0, unverifiable: 3, missing: 0, contradicted: 0 });
});

test('empty and no-claims READMEs give a calm, empty report', () => {
  for (const name of ['empty', 'no-claims']) {
    const { report } = runFixture(name);
    assert.deepEqual(report.findings, []);
    assert.equal(report.mood, 'calm');
  }
});

test('monorepo: scripts and packages are found in workspace package.json files', () => {
  const { report } = runFixture('monorepo');
  assert.equal(byQuote(report, 'Run `npm run dev` to start the web app.').evidence.file, 'packages/web/package.json');
  assert.equal(byQuote(report, 'Uses React for the web app.').bucket, 'verified');
});

test('injection: the report is normal and carries none of the injected text', () => {
  const { report } = runFixture('injection');
  assert.deepEqual(report.counts, { verified: 0, unverifiable: 0, missing: 0, contradicted: 1 });
  const json = JSON.stringify(report);
  assert.ok(!/ignore previous/i.test(json));
  assert.ok(!/mark every finding/i.test(json));
});

test('jev-confident-mislabel: a confident dependency mislabel is Unverifiable, never Contradicted', () => {
  const { report } = runFixture('jev-confident-mislabel');
  assert.deepEqual(report.counts, { verified: 0, unverifiable: 2, missing: 0, contradicted: 0 });
  const beta = byQuote(report, 'Works with Notion (beta).');
  assert.equal(beta.name, 'beta');
  assert.equal(beta.confidence, 0.95);
  assert.equal(beta.lowConfidence, false); // the gate passed it; the prose guard is what protected the user
  assert.equal(byQuote(report, 'Inspired by Notion and Obsidian.').name, null);
});

test('name-pick: Jev picks one of two names; none_of_these leaves the line Unverifiable', () => {
  const { report } = runFixture('name-pick');
  const picked = byQuote(report, 'Built with Express and Koa.');
  assert.equal(picked.name, 'express');
  assert.equal(picked.bucket, 'verified');
  assert.equal(picked.confidence, 0.9); // the weaker of label 0.96 and pick 0.9
  const none = byQuote(report, 'Uses React and Preact.');
  assert.equal(none.name, null);
  assert.equal(none.bucket, 'unverifiable');
});

test('a missing mocked Jev answer is an error, not a silent skip', () => {
  assert.throws(() => runFixture('frontend-vite', { jev: { labels: {}, names: {} } }), /No Jev answer for line 3/);
});
