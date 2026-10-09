import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixture } from './helpers.js';

const TOP_KEYS = ['counts', 'findings', 'meta', 'mood', 'notes', 'receipt', 'repo', 'tilt'];
const FINDING_KEYS = ['bucket', 'claimType', 'confidence', 'decidedBy', 'evidence', 'id', 'line', 'link',
  'lowConfidence', 'name', 'quote', 'verifier'];

test('report matches the 3b schema', () => {
  const { report } = runFixture('monorepo');
  assert.deepEqual(Object.keys(report).sort(), TOP_KEYS);
  assert.deepEqual(Object.keys(report.counts).sort(), ['contradicted', 'missing', 'unverifiable', 'verified']);
  assert.deepEqual(Object.keys(report.repo).sort(), ['name', 'owner', 'readmePath']);
  assert.ok(['calm', 'curious', 'worried', 'tangled'].includes(report.mood));
  assert.equal(typeof report.tilt, 'boolean');
  assert.equal(report.notes, null);
  assert.equal(report.meta.jevModel, 'jev-1.13.0');
  for (const f of report.findings) {
    assert.deepEqual(Object.keys(f).sort(), FINDING_KEYS);
    assert.deepEqual(Object.keys(f.evidence).sort(), ['detail', 'file']);
    assert.match(f.id, /^f-\d\d$/);
    assert.ok(['rule', 'jev'].includes(f.decidedBy));
  }
});

test('quote equals the README line exactly', () => {
  for (const name of ['clean-minimal', 'monorepo', 'frontend-vite', 'envvar-unread']) {
    const { report, readme } = runFixture(name);
    const src = readme.split(/\r?\n/);
    for (const f of report.findings.filter((x) => x.line !== null)) {
      assert.equal(f.quote, src[f.line - 1], `${name} line ${f.line}`);
    }
  }
});

test('confidence is null exactly when a rule decided', () => {
  const { report } = runFixture('clean-minimal');
  for (const f of report.findings) assert.equal(f.confidence === null, f.decidedBy === 'rule');
});

test('Missing findings have no line, quote, or link', () => {
  const { report } = runFixture('missing-package');
  const missing = report.findings.find((f) => f.bucket === 'missing');
  assert.deepEqual([missing.line, missing.quote, missing.link], [null, null, null]);
});

test('line links point at the exact README line', () => {
  const { report } = runFixture('npm-start-drift');
  const f = report.findings.find((x) => x.bucket === 'contradicted');
  assert.equal(f.link, 'https://github.com/fixture/npm-start-drift/blob/HEAD/README.md?plain=1#L6');
});

test('counts add up to the number of findings, and ids are in order', () => {
  const { report } = runFixture('clean-minimal');
  const sum = Object.values(report.counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, report.findings.length);
  assert.deepEqual(report.findings.map((f) => f.id), ['f-01', 'f-02', 'f-03', 'f-04', 'f-05']);
});

test('meta lines: rule-decided plus Jev-decided equals total', () => {
  const { report } = runFixture('clean-minimal');
  assert.equal(report.meta.linesTotal, 16);
  assert.equal(report.meta.linesToJev, 3);
});
