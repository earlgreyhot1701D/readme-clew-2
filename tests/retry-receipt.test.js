// The reason code and the retry flags reach the receipt and the counts-only log line, and nothing else does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsage, logLine } from '../lib/usage.js';
import { summarize, REASONS } from '../lib/summarize.js';
import { scanRepo } from '../lib/scan-repo.js';
import { makeHandler } from '../api/scan.js';
import { loadFixture, runFixture } from './helpers.js';

const GOOD = { summary: 'Everything checked matches.', verified: 'Five checks passed.', unverifiable: 'None.', missing: 'None.', contradicted: 'None.' };
const ok = (obj = GOOD) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 200, output_tokens: 60 }, stop_reason: 'end_turn' }));

test('usage: Haiku reason, retried, and droppedFields are kept; a plain success has none of them', () => {
  const u = createUsage();
  u.setHaiku({ status: 'error', calls: 2, inputTokens: 0, outputTokens: 0, reason: 'http_429', retried: true });
  const haiku = u.entries()[1];
  assert.deepEqual([haiku.status, haiku.reason, haiku.retried, haiku.calls], ['error', 'http_429', true, 2]);
  assert.equal(u.totals().haiku.reason, 'http_429');
  const partial = createUsage();
  partial.setHaiku({ status: 'ok', calls: 1, inputTokens: 100, outputTokens: 40, reason: 'banned', droppedFields: 2 });
  assert.deepEqual([partial.entries()[1].reason, partial.entries()[1].droppedFields, partial.entries()[1].retried], ['banned', 2, undefined]);
  const plain = createUsage();
  plain.setHaiku({ status: 'ok', calls: 1, inputTokens: 100, outputTokens: 40 });
  for (const k of ['reason', 'retried', 'droppedFields']) assert.ok(!(k in plain.entries()[1]), `${k} should be absent`);
});
test('usage: only a string reason and only retried === true are kept (no junk reaches the receipt)', () => {
  const u = createUsage();
  u.setHaiku({ status: 'error', reason: { text: 'a sentence' }, retried: 'yes', droppedFields: 'two' });
  const h = u.entries()[1];
  assert.ok(!('reason' in h) && !('retried' in h) && !('droppedFields' in h));
});
test('usage: the Glasser entry shows retriedCalls only when a call was retried', () => {
  const none = createUsage(); none.addJev([{ questions: 5, attempts: 1, inputTokens: 10, outputTokens: 5, chargeUsd: '0.0001' }]);
  assert.ok(!('retriedCalls' in none.entries()[0]));
  const some = createUsage(); some.addJev([{ questions: 5, attempts: 2, inputTokens: 10, outputTokens: 5, chargeUsd: '0.0001' }, { questions: 5, attempts: 1, inputTokens: 10, outputTokens: 5, chargeUsd: '0.0001' }]);
  assert.equal(some.entries()[0].retriedCalls, 1);
});

// A full scan with a fake Anthropic that says 429 twice, and a stubbed Jev. The receipt is the real receipt.
async function scanWith(haikuSteps) {
  const f = loadFixture('npm-start-drift');
  const steps = [...haikuSteps]; let i = 0;
  const ask = async (reqs) => {
    const answers = {};
    for (const r of reqs) for (const id of Object.keys(r.questions)) answers[id] = { type: 'choice', ...f.jev.labels['3'], probabilities: {} };
    return { answers, calls: [{ questions: 1, attempts: 1, inputTokens: 10, outputTokens: 5, chargeUsd: '0.0001', ms: 1 }] };
  };
  const fetchImpl = async () => { const s = steps[Math.min(i, steps.length - 1)]; i += 1; return s.clone(); };
  return scanRepo({ owner: 'o', name: 'r' }, {
    fetchRepo: async () => ({ readme: f.readme, readmePath: 'README.md', truncated: false, commit: 'a'.repeat(40), snapshot: f.snapshot }),
    ask,
    summarize: (report) => summarize(report, { fetchImpl, apiKey: 'sk-test', sleep: async () => {}, random: () => 0 }),
  });
}
test('receipt: two 429s from Haiku give reason http_429, retried true, and the report still has no notes', async () => {
  const { report, usage } = await scanWith([new Response('{}', { status: 429 })]);
  const haiku = report.receipt.calls.find((c) => c.provider === 'Anthropic');
  assert.deepEqual([haiku.status, haiku.reason, haiku.retried, haiku.calls], ['error', 'http_429', true, 2]);
  assert.equal(report.notes, null);
  assert.equal(report.counts.contradicted, 1); // the report itself is complete
  assert.equal(usage.haiku.reason, 'http_429');
});
test('receipt: a 429 then success has retried true and no reason, and the notes are there', async () => {
  const { report } = await scanWith([new Response('{}', { status: 429 }), ok()]);
  const haiku = report.receipt.calls.find((c) => c.provider === 'Anthropic');
  assert.deepEqual([haiku.status, haiku.retried, haiku.reason], ['ok', true, undefined]);
  assert.equal(report.notes.summary, GOOD.summary);
});
test('receipt: a dropped banned field is recorded as reason banned with a count, and the other notes stay', async () => {
  const { report } = await scanWith([ok({ ...GOOD, summary: 'The mood is calm.' })]);
  const haiku = report.receipt.calls.find((c) => c.provider === 'Anthropic');
  assert.deepEqual([haiku.status, haiku.reason, haiku.droppedFields], ['ok', 'banned', 1]);
  assert.equal(report.notes.summary, null);
  assert.equal(report.notes.buckets.verified, GOOD.verified);
});
test('receipt: every Haiku failure code lands in the receipt as one of the eight codes, and the receipt holds no model text', async () => {
  const cases = { http_429: new Response('{}', { status: 429 }), http_5xx: new Response('{}', { status: 500 }), http_4xx: new Response('{}', { status: 401 }), parse: new Response('nope') };
  for (const [code, res] of Object.entries(cases)) {
    const { report } = await scanWith([res]);
    const haiku = report.receipt.calls.find((c) => c.provider === 'Anthropic');
    assert.equal(haiku.reason, code);
    assert.ok(REASONS.includes(haiku.reason));
    assert.ok(!JSON.stringify(report.receipt).includes('The mood'));
  }
});
test('receipt hash still re-checks: the fingerprint covers the report without the receipt, so the new fields do not break it', async () => {
  const { hashReport } = await import('../lib/receipt.js');
  const { report } = await scanWith([new Response('{}', { status: 429 })]);
  assert.equal(report.receipt.reportSha256, hashReport(report));
});

// ---- the counts-only log line ----
test('log line: haiku (a code), haikuRetried, and jevRetried are kept, and still only codes, counts, and timing', () => {
  const o = JSON.parse(logLine({ id: 'abc', path: '/api/scan', method: 'POST', status: 200, ms: 12, counts: { verified: 3 }, haiku: 'http_429', haikuRetried: 1, jevRetried: 0 }));
  assert.deepEqual(o, { id: 'abc', path: '/api/scan', method: 'POST', status: 200, ms: 12, counts: { verified: 3 }, haiku: 'http_429', haikuRetried: 1, jevRetried: 0 });
});
test('log line: a sentence, markup, a long string, or an object in a code field is dropped, never logged', () => {
  const bad = ['The mood is worried', 'Found 28 low-confidence findings', '<script>', 'x'.repeat(81), 'two words', 'a,b', { summary: 'text' }, ['x'], null, undefined];
  for (const v of bad) {
    const o = JSON.parse(logLine({ id: 'abc', haiku: v }));
    assert.ok(!('haiku' in o), `haiku=${JSON.stringify(v)} should be dropped`);
  }
  const line = logLine({ id: 'abc', haiku: 'banned', notes: { summary: 'The mood is worried' }, summary: 'text', prompt: 'p', readme: 'r' });
  assert.deepEqual(Object.keys(JSON.parse(line)).sort(), ['haiku', 'id']);
});
test('log line: every reason code is loggable as it is', () => {
  for (const code of [...REASONS, 'ok', 'skipped']) assert.equal(JSON.parse(logLine({ haiku: code })).haiku, code);
});

// ---- the handler writes it ----
const req = () => new Request('https://site.example/api/scan', { method: 'POST', body: JSON.stringify({ repo: 'https://github.com/o/r' }) });
test('handler: a 200 logs the Haiku reason and the retry counts, and not one word of the notes', async () => {
  const base = runFixture('clean-minimal').report;
  const report = { ...base, notes: { summary: 'The mood is worried and SECRET-NOTE-TEXT.', buckets: {} } };
  const logs = [];
  const scan = async () => ({ report, usage: { haiku: { status: 'ok', reason: 'banned', retried: true }, jev: { retriedCalls: 2 } } });
  const res = await makeHandler({ scan, log: (l) => logs.push(l), newId: () => 'id1' })(req());
  assert.equal(res.status, 200);
  const l = JSON.parse(logs[0]);
  assert.deepEqual([l.haiku, l.haikuRetried, l.jevRetried], ['banned', 1, 2]);
  assert.ok(!logs[0].includes('SECRET-NOTE-TEXT') && !/mood/i.test(logs[0]), 'no notes text in the log');
});
test('handler: with no reason the log carries the status (ok), zero retries, and a missing usage object does not crash', async () => {
  const report = runFixture('clean-minimal').report;
  const logs = [];
  await makeHandler({ scan: async () => ({ report, usage: { haiku: { status: 'ok' }, jev: { retriedCalls: 0 } } }), log: (l) => logs.push(l), newId: () => 'a' })(req());
  assert.deepEqual([JSON.parse(logs[0]).haiku, JSON.parse(logs[0]).haikuRetried, JSON.parse(logs[0]).jevRetried], ['ok', 0, 0]);
  const logs2 = [];
  const res = await makeHandler({ scan: async () => ({ report }), log: (l) => logs2.push(l), newId: () => 'b' })(req());
  assert.equal(res.status, 200);
  assert.deepEqual([JSON.parse(logs2[0]).haikuRetried, JSON.parse(logs2[0]).jevRetried], [0, 0]);
});
