// The golden set declares an end-to-end expectation: on fixtures/golden/hard-cases.md, lines 23, 29
// and 31 are the only ones the pipeline must contradict. Nothing checked that until now. This replays
// the owner-approved labels (data, not model output) through the real pipeline, so it runs offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runPipeline } from '../lib/pipeline.js';

const golden = JSON.parse(readFileSync(new URL('../fixtures/golden/golden-set.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../fixtures/golden/hard-cases.md', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../fixtures/golden/hard-cases.repo.json', import.meta.url), 'utf8'));

// A label map answers per line; anything the golden set does not name stays not_a_claim.
const answers = (field) => {
  const map = {};
  for (const item of golden.items.filter((i) => i.src === 'H')) {
    map[item.line] = { choice: field === 'labels' ? item.expected : 'none', confidence: 1 };
  }
  return {
    get: (_, key) => map[Number(key)] ?? { choice: 'not_a_claim', confidence: 1 },
  };
};

test('golden end to end: only lines 23, 29 and 31 are contradicted on hard cases', () => {
  const report = runPipeline({
    readme,
    repo: { owner: 'golden', name: 'hard-cases' },
    snapshot,
    jev: { labels: new Proxy({}, answers('labels')), names: new Proxy({}, answers('names')) },
  });
  const contradicted = report.findings.filter((f) => f.bucket === 'contradicted').map((f) => f.line).sort((a, b) => a - b);
  assert.deepEqual(contradicted, [...golden.endToEnd.shouldContradict].sort((a, b) => a - b));
  // and no other line may be contradicted, which is the promise that matters
  assert.equal(report.counts.contradicted, golden.endToEnd.shouldContradict.length);
});
