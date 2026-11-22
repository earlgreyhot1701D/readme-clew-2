// Blind cases from a manual audit of 1165 public repositories. Each fixture is neutral on purpose: the
// repository is demo/repo and the file name is an index, so nothing in the path or the name hints at the
// answer. The labels were written by hand before this test existed and are frozen; changing one is its
// own commit with the reason recorded in the ledger.
//
// Tag meanings:
//   policy      the expectation is the policy we want, and it must hold
//   observed    a true statement whose handling is still a product decision (kept as reported)
//   gap         a known wrong verdict, frozen at today's behaviour so a change cannot slip through
//   undecidable the snapshot is not enough to decide; nothing is asserted
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runPipeline } from '../lib/pipeline.js';

const DIR = new URL('../fixtures/blind/', import.meta.url);
const labels = JSON.parse(fs.readFileSync(new URL('labels.json', DIR), 'utf8'));
const noJev = new Proxy({}, { get: () => ({ choice: 'not_a_claim', confidence: 1 }) });

const load = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, DIR), 'utf8'));
const verdict = (fixture, name) => runPipeline({
  readme: fixture.readme,
  repo: fixture.repo,
  snapshot: fixture.snapshot,
  jev: { labels: noJev, names: noJev },
}).findings.some((f) => f.bucket === 'missing' && f.name === name);

// The fixture has to stay blind: a repository name or a path that names the case would leak the label.
test('blind cases: fixtures are anonymous and complete', () => {
  assert.equal(labels.length, 63);
  for (const label of labels) {
    const fixture = load(label.id);
    assert.equal(fixture.repo.owner, 'demo', label.id);
    assert.equal(fixture.repo.name, 'repo', label.id);
    assert.equal(Object.keys(fixture.snapshot.sources).length > 0, true, `${label.id} has no source`);
    assert.equal(typeof fixture.readme, 'string', label.id);
  }
});

test('blind cases: every policy case matches its frozen label', () => {
  const failures = [];
  for (const label of labels.filter((l) => l.tag === 'policy')) {
    const fixture = load(label.id);
    const got = verdict(fixture, label.name);
    const want = label.expect === 'reported';
    if (got !== want) failures.push(`${label.id} expected ${label.expect}, got ${got ? 'reported' : 'not_reported'}`);
  }
  assert.deepEqual(failures, []);
});

test('blind cases: known gaps are frozen at their current verdict', () => {
  const failures = [];
  for (const label of labels.filter((l) => l.tag === 'gap')) {
    const fixture = load(label.id);
    const got = verdict(fixture, label.name);
    if (String(got ? 'reported' : 'not_reported') !== label.frozen) {
      failures.push(`${label.id} moved: frozen ${label.frozen}, now ${got ? 'reported' : 'not_reported'}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('blind cases: the label set is the one the audit produced', () => {
  const count = (tag) => labels.filter((l) => l.tag === tag).length;
  assert.equal(count('policy'), 40);
  assert.equal(count('observed'), 18);
  assert.equal(count('gap'), 2);
  assert.equal(count('undecidable'), 3);
});
