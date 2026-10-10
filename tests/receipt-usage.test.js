import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, hashReport, canonicalJson } from '../lib/receipt.js';
import { createUsage, logLine, haikuCostUsd } from '../lib/usage.js';
import { runFixture } from './helpers.js';

const make = () => {
  const { report, readme } = runFixture('clean-minimal');
  const usage = createUsage();
  usage.addJev([{ questions: 3, inputTokens: 100, outputTokens: 10, chargeUsd: '0.000500', trimmedState: false }]);
  usage.setHaiku({ status: 'ok', calls: 1, inputTokens: 300, outputTokens: 90 });
  const receipt = buildReceipt({ runId: 'scan_1', now: new Date('2026-10-09T18:22:04.512Z'), repo: { owner: 'o', name: 'r' }, commit: 'a1b2c3d4e5', readme, report, calls: usage.entries(), stepsMs: { github: 1, jev: 2, haiku: 3 } });
  return { report, readme, receipt, usage };
};

test('receipt: line counts add up (rule + Jev = total)', () => {
  const { receipt } = make();
  assert.equal(receipt.lines.decidedByRule + receipt.lines.decidedByJev, receipt.lines.total);
  assert.equal(receipt.lines.total, 16);
  assert.equal(receipt.lines.decidedByJev, 3);
});
test('receipt: fields, short commit, UTC time without milliseconds', () => {
  const { receipt } = make();
  assert.equal(receipt.scannedAt, '2026-10-09T18:22:04Z');
  assert.equal(receipt.commit, 'a1b2c3d');
  assert.equal(receipt.repo, 'o/r');
  assert.match(receipt.readmeSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.architecture, /Haiku explains/);
});
test('receipt: reportSha256 matches a re-hash of the report without the receipt', () => {
  const { report, receipt } = make();
  assert.equal(receipt.reportSha256, hashReport({ ...report, receipt }));
  assert.equal(receipt.reportSha256, hashReport({ ...report, receipt: null }));
  assert.notEqual(receipt.reportSha256, hashReport({ ...report, mood: 'tangled' }));
});
test('receipt: hash does not depend on key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 }));
});
test('receipt: carries no README text and no quotes', () => {
  const { receipt, report, readme } = make();
  const json = JSON.stringify(receipt);
  for (const line of readme.split('\n').filter((l) => l.length > 8)) assert.ok(!json.includes(line), line);
  for (const f of report.findings) assert.ok(!json.includes(f.quote));
});
test('usage: totals equal the sum of calls; Haiku cost is an estimate from published prices', () => {
  const { usage } = make();
  const t = usage.totals();
  assert.deepEqual([t.jev.calls, t.jev.inputTokens, t.jev.chargeUsd], [1, 100, '0.000500']);
  assert.equal(t.haiku.costUsdEstimate, haikuCostUsd(300, 90));
  assert.equal(haikuCostUsd(1_000_000, 1_000_000), '0.600000');
  const [jev, haiku] = usage.entries();
  assert.deepEqual([jev.provider, haiku.provider, haiku.status], ['Glasser', 'Anthropic', 'ok']);
});
test('usage: a skipped Haiku is zero calls and zero cost', () => {
  const u = createUsage();
  assert.deepEqual([u.totals().haiku.status, u.totals().haiku.calls, u.totals().haiku.costUsdEstimate], ['skipped', 0, '0.000000']);
});
test('log line: only whitelisted counts fields, no content', () => {
  const line = logLine({ id: 'abc', path: '/api/scan', method: 'POST', status: 200, ms: 12, counts: { verified: 3, bad: 'text' },
    readme: 'SECRET README', prompt: 'p', quote: 'q', evidence: 'e', errorCode: 'has spaces and text' });
  const o = JSON.parse(line);
  assert.deepEqual(Object.keys(o).sort(), ['counts', 'id', 'ms', 'method', 'path', 'status'].sort());
  assert.deepEqual(o.counts, { verified: 3 });
  assert.ok(!/SECRET|prompt|quote/.test(line));
});
