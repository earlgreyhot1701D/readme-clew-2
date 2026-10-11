// tools/usage-report.js with a fake Glasser: pagination, sums, and that nothing identifying reaches the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, summarize, render, anthropicSpend } from '../tools/usage-report.js';

const pages = { '': { data: [{ id: 'run_SECRET1', status: 'COMPLETED', charge_usd: '0.001', created_at: '2026-10-10T01:00:00Z' }], next_cursor: 'c2' },
  c2: { data: [{ id: 'run_SECRET2', status: 'FAILED', charge_usd: '0', created_at: '2026-10-11T01:00:00Z' }], next_cursor: null } };
const fake = async (url) => ({ ok: true, json: async () => pages[new URL(url).searchParams.get('cursor') ?? ''] });

test('usage report: follows next_cursor and sends the bearer key', async () => {
  let auth;
  const runs = await fetchAll('/runs', 'k', async (u, o) => { auth = o.headers.authorization; return fake(u); });
  assert.equal(runs.length, 2);
  assert.equal(auth, 'Bearer k');
});

test('usage report: totals, days, balances, and no ids or keys in the text', async () => {
  const runs = await fetchAll('/runs', 'KEYVALUE', fake);
  const hist = [{ kind: 'charge', amount_usd: '-0.001', balance_after_usd: '10.999', created_at: '2026-10-10T01:00:01Z' },
    { kind: 'grant', amount_usd: '11', balance_after_usd: '11', created_at: '2026-10-09T00:00:00Z' }];
  const s = summarize(runs, hist);
  assert.deepEqual([s.completed, s.failed, s.spend, s.start, s.now], [1, 1, 1000, 11e6, 10999000]);
  const text = render(s, null, '2026-10-11');
  assert.match(text, /Glasser's own run and balance history/);
  assert.doesNotMatch(text, /SECRET|KEYVALUE/);
});

test('usage report: Anthropic spend only when the log has it', () => {
  assert.equal(anthropicSpend('{"provider":"Glasser"}\n'), null);
  assert.deepEqual(anthropicSpend('{"provider":"Anthropic","costUsdEstimate":"0.000100"}\n'), { m: 100, n: 1 });
});
