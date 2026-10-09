import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketize, makeFinding, ORDER } from '../lib/buckets.js';

const f = (bucket, line) => ({ bucket, line });

test('every finding lands in exactly one bucket', () => {
  const input = [f('verified', 3), f('contradicted', 9), f('missing', null), f('unverifiable', 1), f('verified', 2)];
  const { findings, counts } = bucketize(input);
  assert.equal(findings.length, input.length);
  assert.equal(counts.verified + counts.unverifiable + counts.missing + counts.contradicted, input.length);
  assert.deepEqual(counts, { verified: 2, unverifiable: 1, missing: 1, contradicted: 1 });
});

test('findings are ordered Contradicted, Missing, Unverifiable, Verified, then by line', () => {
  const { findings } = bucketize([f('verified', 3), f('contradicted', 9), f('missing', null), f('unverifiable', 1), f('verified', 2)]);
  assert.deepEqual(findings.map((x) => x.bucket), ['contradicted', 'missing', 'unverifiable', 'verified', 'verified']);
  assert.deepEqual(findings.filter((x) => x.bucket === 'verified').map((x) => x.line), [2, 3]);
  assert.deepEqual(ORDER, ['contradicted', 'missing', 'unverifiable', 'verified']);
});

test('an unknown bucket throws', () => {
  assert.throws(() => bucketize([f('maybe', 1)]), /unknown bucket/);
});

test('makeFinding copies the claim fields and the verifier result', () => {
  const claim = { claimType: 'command', line: 4, quote: 'npm start', name: 'npm start', decidedBy: 'rule', confidence: null };
  const out = makeFinding(claim, { bucket: 'verified', evidence: { file: 'package.json', detail: 'ok' } }, 'commands');
  assert.equal(out.quote, 'npm start');
  assert.equal(out.bucket, 'verified');
  assert.equal(out.verifier, 'commands');
  assert.equal(out.lowConfidence, false);
});
