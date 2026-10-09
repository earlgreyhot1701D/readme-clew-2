import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mood } from '../lib/mood.js';

const c = (verified = 0, unverifiable = 0, missing = 0, contradicted = 0) => ({ verified, unverifiable, missing, contradicted });

test('tangled: any Contradicted', () => {
  assert.equal(mood(c(5, 0, 2, 1)).mood, 'tangled');
});
test('worried: no Contradicted, any Missing', () => {
  assert.equal(mood(c(5, 0, 1, 0)).mood, 'worried');
});
test('curious: at least half Unverifiable', () => {
  assert.equal(mood(c(1, 1, 0, 0)).mood, 'curious');
  assert.equal(mood(c(1, 3, 0, 0)).mood, 'curious');
});
test('calm: everything else', () => {
  assert.equal(mood(c(5, 1, 0, 0)).mood, 'calm');
  assert.equal(mood(c()).mood, 'calm');
});
test('tilt: any low-confidence finding', () => {
  assert.equal(mood(c(1), [{ lowConfidence: false }]).tilt, false);
  assert.equal(mood(c(1), [{ lowConfidence: false }, { lowConfidence: true }]).tilt, true);
  assert.equal(mood(c()).tilt, false);
});
