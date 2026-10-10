import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, THRESHOLD } from '../lib/gate.js';
import { runPipeline } from '../lib/pipeline.js';

test('the threshold is the final 0.8 set in Block 2', () => {
  assert.equal(THRESHOLD, 0.8);
});

test('below threshold fails the gate with the low-confidence tag', () => {
  const g = gate({ claimType: 'command', decidedBy: 'jev', confidence: 0.79 });
  assert.deepEqual(g, { pass: false, lowConfidence: true });
});

test('at or above threshold passes', () => {
  assert.equal(gate({ claimType: 'dependency', decidedBy: 'jev', confidence: 0.8 }).pass, true);
  assert.equal(gate({ claimType: 'env_var', decidedBy: 'jev', confidence: 0.99 }).pass, true);
});

test('rule decisions are never gated', () => {
  assert.equal(gate({ claimType: 'command', decidedBy: 'rule', confidence: null }).pass, true);
});

test('labels that no verifier uses are not gated', () => {
  assert.equal(gate({ claimType: 'unverifiable', decidedBy: 'jev', confidence: 0.2 }).pass, true);
  assert.equal(gate({ claimType: 'not_a_claim', decidedBy: 'jev', confidence: 0.2 }).pass, true);
});

const snapshot = { pkg: { name: 'x', scripts: {} }, workspaces: [], files: ['package.json'], sources: {} };
const run = (confidence) => runPipeline({
  readme: 'Run `npm run nope` now.\n',
  repo: { owner: 'o', name: 'r', readmePath: 'README.md' },
  snapshot,
  jev: { labels: { 1: { choice: 'command', confidence } }, names: {} },
});

test('low confidence never produces Contradicted', () => {
  const low = run(0.4);
  assert.equal(low.counts.contradicted, 0);
  assert.equal(low.findings[0].bucket, 'unverifiable');
  assert.equal(low.findings[0].lowConfidence, true);
  assert.equal(low.tilt, true);
});

test('the same claim at high confidence is Contradicted, so the gate is what changed the outcome', () => {
  const high = run(0.9);
  assert.equal(high.findings[0].bucket, 'contradicted');
  assert.equal(high.findings[0].lowConfidence, false);
});

// Two name candidates on one line: Jev picks one (PRD 4.2). The gate uses the weaker of the two confidences.
const twoNames = (pick) => runPipeline({
  readme: 'Built with Express and Koa.\n',
  repo: { owner: 'o', name: 'r', readmePath: 'README.md' },
  snapshot: { pkg: { name: 'x', dependencies: { express: '^4' } }, workspaces: [], files: ['package.json'], sources: {} },
  jev: { labels: { 1: { choice: 'dependency', confidence: 0.95 } }, names: pick ? { 1: pick } : {} },
});

test('name pick: a confident pick is verified against code', () => {
  const f = twoNames({ choice: 'express', confidence: 0.9 }).findings[0];
  assert.equal(f.name, 'express');
  assert.equal(f.bucket, 'verified');
  assert.equal(f.decidedBy, 'jev');
  assert.equal(f.confidence, 0.9);
});

test('name pick: a wavering pick is gated, even if the label was confident', () => {
  const f = twoNames({ choice: 'koa', confidence: 0.4 }).findings[0];
  assert.equal(f.bucket, 'unverifiable');
  assert.equal(f.lowConfidence, true);
  assert.equal(f.confidence, 0.4);
});

test('name pick: with two candidates and no pick, the claim is Unverifiable, never Contradicted', () => {
  const f = twoNames(null).findings[0];
  assert.equal(f.name, null);
  assert.equal(f.bucket, 'unverifiable');
});

test('name pick: a pick that is not one of the candidates is ignored', () => {
  const f = twoNames({ choice: 'fastify', confidence: 0.99 }).findings[0];
  assert.equal(f.name, null);
  assert.equal(f.bucket, 'unverifiable');
});
