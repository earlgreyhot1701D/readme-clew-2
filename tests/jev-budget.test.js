import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRequests, estimateTokens, LIMIT_STATE_PLUS_LONGEST, LIMIT_TOTAL } from '../lib/jev-budget.js';
import { askAll, JevError } from '../lib/jev.js';

const fail = (code, message) => { throw new JevError(code, message); };
const q = (chars = 100) => ({ type: 'choice', instructions: 'x'.repeat(chars), criteria: { a: 'a', b: 'b' } });
const qs = (n, chars) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i}`, q(chars)]));
const readmeState = (lines) => ({ readme: Array.from({ length: lines }, (_, i) => `${i + 1}: ${'word '.repeat(7 + (i % 11))}`).join('\n') });
const longest = (job) => Math.max(...Object.values(job.questions).map(estimateTokens));

test('small input passes through untrimmed, split by the 100-question cap', () => {
  const jobs = planRequests([{ state: readmeState(20), questions: qs(250) }], 100, fail);
  assert.deepEqual(jobs.map((j) => Object.keys(j.questions).length), [100, 100, 50]);
  assert.ok(jobs.every((j) => j.trimmed === false));
});
test('an oversize README state is trimmed (never the questions), to fit 32K for state plus the longest question', () => {
  const state = readmeState(6000); // far over budget
  const [job] = planRequests([{ state, questions: qs(10) }], 100, fail);
  assert.equal(job.trimmed, true);
  assert.ok(job.state.readme.length < state.readme.length);
  assert.ok(estimateTokens(job.state) + longest(job) <= LIMIT_STATE_PLUS_LONGEST);
  assert.equal(Object.keys(job.questions).length, 10);
});
test('the 64K total is respected: state plus all questions', () => {
  const jobs = planRequests([{ state: readmeState(6000), questions: qs(100, 600) }], 100, fail);
  for (const j of jobs) {
    const total = estimateTokens(j.state) + Object.values(j.questions).reduce((a, x) => a + estimateTokens(x), 0);
    assert.ok(total <= LIMIT_TOTAL, `total ${total}`);
  }
});
test('a trimmed state ends on a whole line', () => {
  const [job] = planRequests([{ state: readmeState(6000), questions: qs(5) }], 100, fail);
  assert.ok(job.state.readme.split('\n').every((l) => /^\d+: (word )+$/.test(l)), 'every kept line is complete');
});
test('rejects only when one question cannot fit, with an honest error', () => {
  assert.throws(() => planRequests([{ state: 'x', questions: { l1: q(LIMIT_STATE_PLUS_LONGEST * 3) } }], 100, fail),
    (e) => e.code === 'too_large' && /l1/.test(e.message));
});
test('a plain-string state that is too big is rejected, not silently cut', () => {
  assert.throws(() => planRequests([{ state: 'x'.repeat(LIMIT_STATE_PLUS_LONGEST * 4), questions: qs(1) }], 100, fail), { code: 'too_large' });
});
test('askAll enforces it before any request is sent', async () => {
  let sent = 0;
  const fetchImpl = async () => { sent += 1; return new Response('{}'); };
  await assert.rejects(askAll([{ state: 's', questions: { l1: q(LIMIT_STATE_PLUS_LONGEST * 3) } }], { fetchImpl, apiKey: 'k' }), { code: 'too_large' });
  assert.equal(sent, 0);
});
test('askAll sends the trimmed state and marks the call as trimmed', async () => {
  const bodies = [];
  const fetchImpl = async (u, init) => {
    const input = JSON.parse(init.body).input;
    bodies.push(input);
    const answers = Object.fromEntries(Object.keys(input.questions).map((id) => [id, { type: 'choice', choice: 'a', confidence: 0.9, probabilities: {} }]));
    return new Response(JSON.stringify({ status: 'COMPLETED', provider_response: { http_status: 200 }, charge_usd: '0.001', output: { model: 'jev-1.13.0', answers, usage: { input_tokens: 1, output_tokens: 1 } } }));
  };
  const state = readmeState(6000);
  const r = await askAll([{ state, questions: qs(10) }], { fetchImpl, apiKey: 'k' });
  assert.ok(bodies[0].state.readme.length < state.readme.length);
  assert.equal(r.calls[0].trimmedState, true);
});
