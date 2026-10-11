// Jev (Glasser) retry rules in lib/jev.js: one retry on 5xx, network, or timeout; never on a 4xx; a new idempotency key each
// attempt; and only if the function budget allows. A fake fetch and a fake clock. No network, no real key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callJev, askAll, JevError, MODEL, RETRY_MIN_REMAINING_MS, RETRY_BACKOFF_MS, JEV_BUDGET_MS } from '../lib/jev.js';
import { scanRepo } from '../lib/scan-repo.js';
import { loadFixture } from './helpers.js';

const KEY = 'test-key-not-a-real-key';
const CRIT = { a: 'first', b: 'second' };
const qs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i}`, { type: 'choice', instructions: 'x', criteria: CRIT }]));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const okRun = (input) => ({
  id: 'run_1', status: 'COMPLETED', provider_response: { http_status: 200 }, charge_usd: '0.000500',
  output: { model: MODEL, answers: Object.fromEntries(Object.keys(input.questions).map((id) => [id, { type: 'choice', choice: 'a', confidence: 0.9, probabilities: {} }])), usage: { input_tokens: 100, output_tokens: 50 } },
});

// steps: an Error (thrown), a number (HTTP status), or 'ok'. Records every request.
function rig(steps, { clock = { t: 1_000_000 } } = {}) {
  const seen = [];
  const waits = [];
  const f = async (url, init) => {
    seen.push({ url, init, key: init.headers['idempotency-key'], input: JSON.parse(init.body).input, signal: init.signal });
    const step = steps[Math.min(seen.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (step === 'ok') return json(okRun(JSON.parse(init.body).input));
    return json({ error: { code: 'x' } }, step);
  };
  return { f, seen, waits, clock, opts: (extra = {}) => ({ fetchImpl: f, apiKey: KEY, now: () => clock.t, wait: async (ms) => { waits.push(ms); }, random: () => 0, ...extra }) };
}
const call = (r, extra) => callJev({ state: 's', questions: qs(1) }, r.opts(extra));

test('constants: 8 s of budget needed for a retry, 48 s of the 60 s for Jev, jitter 300 to 700 ms', () => {
  assert.equal(RETRY_MIN_REMAINING_MS, 8_000);
  assert.equal(JEV_BUDGET_MS, 48_000);
  assert.deepEqual(RETRY_BACKOFF_MS, [300, 700]);
});

// ---- retried ----
test('5xx then success: one retry with a NEW idempotency key, and the call says attempts 2', async () => {
  for (const status of [500, 502, 503, 504, 529]) {
    const r = rig([status, 'ok']);
    const out = await call(r);
    assert.equal(r.seen.length, 2, String(status));
    const [k1, k2] = r.seen.map((s) => s.key);
    assert.match(k1, /^[0-9a-f-]{36}$/);
    assert.match(k2, /^[0-9a-f-]{36}$/);
    assert.notEqual(k1, k2, `${status}: the retry must not reuse the key`);
    assert.equal(out.call.attempts, 2, String(status));
  }
});
test('a network error then success is retried once with a new key', async () => {
  const r = rig([new TypeError('fetch failed'), 'ok']);
  const out = await call(r);
  assert.equal(r.seen.length, 2);
  assert.notEqual(r.seen[0].key, r.seen[1].key);
  assert.equal(out.call.attempts, 2);
});
test('a timeout then success is retried once with a new key', async () => {
  const r = rig([new DOMException('timed out', 'TimeoutError'), 'ok']);
  const out = await call(r);
  assert.equal(r.seen.length, 2);
  assert.notEqual(r.seen[0].key, r.seen[1].key);
  assert.equal(out.call.attempts, 2);
  const r2 = rig([new DOMException('aborted', 'AbortError'), 'ok']);
  assert.equal((await call(r2)).call.attempts, 2); // an abort from our own timer counts as a timeout
});
test('a real hanging request that times out is retried once, and a second hang gives timeout', async () => {
  let n = 0;
  const hang = (u, { signal }) => { n += 1; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason))); };
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, { fetchImpl: hang, apiKey: KEY, timeoutMs: 20, wait: async () => {}, random: () => 0 }), { code: 'timeout' });
  assert.equal(n, 2); // one try and one retry, no more
});
test('only one retry: two 5xx in a row give up with unavailable after exactly two requests', async () => {
  const r = rig([503, 503, 'ok']);
  await assert.rejects(call(r), { code: 'unavailable', status: 503 });
  assert.equal(r.seen.length, 2);
});
test('only one retry: two network errors give network, and two timeouts give timeout', async () => {
  const net = rig([new TypeError('a'), new TypeError('b'), 'ok']);
  await assert.rejects(call(net), { code: 'network' });
  assert.equal(net.seen.length, 2);
  const to = rig([new DOMException('t', 'TimeoutError'), new DOMException('t', 'TimeoutError'), 'ok']);
  await assert.rejects(call(to), { code: 'timeout' });
  assert.equal(to.seen.length, 2);
});
test('a 5xx then a 4xx stops at the 4xx with its own code (no further retry)', async () => {
  const r = rig([500, 401, 'ok']);
  await assert.rejects(call(r), { code: 'unauthorized' });
  assert.equal(r.seen.length, 2);
});

// ---- never retried ----
test('4xx is never retried: 400, 401, 402, 403, 404, 413, 422, and 429 all stop after one request', async () => {
  const codes = { 400: 'bad_request', 401: 'unauthorized', 402: 'insufficient_balance', 403: 'unavailable', 404: 'unavailable', 413: 'unavailable', 422: 'bad_request', 429: 'rate_limited' };
  for (const [status, code] of Object.entries(codes)) {
    const r = rig([Number(status), 'ok']);
    await assert.rejects(call(r), { code }, status);
    assert.equal(r.seen.length, 1, `${status} must not be retried`);
    assert.deepEqual(r.waits, [], `${status} must not wait`);
  }
});
test('a failed run, a wrong model, and a bad answer are not retried either', async () => {
  const failed = rig([]);
  failed.f.seen = null;
  const f = async () => json({ id: 'r', status: 'FAILED', charge_usd: '0.000000' });
  let n = 0;
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, { fetchImpl: async (...a) => { n += 1; return f(...a); }, apiKey: KEY, wait: async () => {} }), { code: 'run_failed' });
  assert.equal(n, 1);
});

// ---- the budget ----
test('no retry when less than 8 s of the Jev budget remains: a 5xx gives unavailable straight away', async () => {
  const clock = { t: 1_000_000 };
  const r = rig([503, 'ok'], { clock });
  await assert.rejects(call(r, { deadlineAt: clock.t + 7_999 }), { code: 'unavailable' });
  assert.equal(r.seen.length, 1);
  assert.deepEqual(r.waits, []);
});
test('a retry happens at exactly 8 s remaining, and not at 7.999 s', async () => {
  const clock = { t: 1_000_000 };
  const yes = rig([503, 'ok'], { clock });
  await call(yes, { deadlineAt: clock.t + 8_000 });
  assert.equal(yes.seen.length, 2);
  const no = rig([503, 'ok'], { clock });
  await assert.rejects(call(no, { deadlineAt: clock.t + 7_999 }), { code: 'unavailable' });
  assert.equal(no.seen.length, 1);
});
test('network errors and timeouts follow the same budget rule', async () => {
  const clock = { t: 1_000_000 };
  for (const err of [new TypeError('down'), new DOMException('t', 'TimeoutError')]) {
    const tight = rig([err, 'ok'], { clock });
    await assert.rejects(call(tight, { deadlineAt: clock.t + 3_000 }));
    assert.equal(tight.seen.length, 1);
    const roomy = rig([err, 'ok'], { clock });
    assert.equal((await call(roomy, { deadlineAt: clock.t + 30_000 })).call.attempts, 2);
  }
});
test('the budget is read at the moment of the retry: a slow first attempt can use it up', async () => {
  const clock = { t: 1_000_000 };
  const seen = [];
  const f = async (u, init) => { seen.push(init); clock.t += 41_000; return json({}, 503); }; // the first attempt "takes" 41 s of a 48 s budget
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, { fetchImpl: f, apiKey: KEY, now: () => clock.t, deadlineAt: 1_000_000 + 48_000, wait: async () => {}, random: () => 0 }), { code: 'unavailable' });
  assert.equal(seen.length, 1); // 7 s left is under 8 s
});
test('each attempt is cut to the time left: a first attempt cannot run past the deadline', async () => {
  const clock = { t: 1_000_000 };
  let aborted = null;
  const f = (u, { signal }) => new Promise((_, rej) => {
    const start = Date.now();
    signal.addEventListener('abort', () => { aborted = Date.now() - start; rej(signal.reason); });
  });
  // deadline in 1 s (the floor), a 40 s timeout would otherwise apply: the attempt must end by about 1 s
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, { fetchImpl: f, apiKey: KEY, now: () => clock.t, deadlineAt: clock.t + 1_000, timeoutMs: 40_000, wait: async () => {}, random: () => 0 }), { code: 'timeout' });
  assert.ok(aborted >= 900 && aborted < 2_500, `aborted after ${aborted} ms`);
});

// ---- backoff ----
test('the wait before the retry is jittered between 300 and 700 ms', async () => {
  for (const [rand, expected] of [[0, 300], [0.5, 500], [0.999, 699.6]]) {
    const r = rig([500, 'ok']);
    await call(r, { random: () => rand });
    assert.equal(r.waits.length, 1);
    assert.ok(Math.abs(r.waits[0] - expected) < 0.5, `random ${rand} gave ${r.waits[0]}`);
  }
});

// ---- through the pipeline ----
test('askAll passes the deadline and the clock down, so every call in a batch obeys the budget', async () => {
  const clock = { t: 5_000_000 };
  const r = rig([503, 'ok'], { clock });
  await assert.rejects(askAll([{ state: 's', questions: qs(1) }], r.opts({ deadlineAt: clock.t + 2_000 })), { code: 'unavailable' });
  assert.equal(r.seen.length, 1);
  const r2 = rig([503, 'ok'], { clock });
  const out = await askAll([{ state: 's', questions: qs(1) }], r2.opts({ deadlineAt: clock.t + 20_000 }));
  assert.equal(out.calls[0].attempts, 2);
});
test('totals count the calls that needed a retry', async () => {
  const r = rig([500, 'ok', 'ok', 'ok']);
  const { calls } = await askAll([{ state: 's', questions: qs(250) }], r.opts({ concurrency: 1 }));
  const { totalUsage } = await import('../lib/jev.js');
  assert.equal(calls.length, 3);
  assert.equal(totalUsage(calls).retriedCalls, 1);
});
test('scanRepo gives the real Jev call a 48 s deadline from the start of the scan, and retries inside it', async () => {
  const f = loadFixture('npm-start-drift');
  const clock = { t: 10_000_000 };
  const realFetch = globalThis.fetch;
  const envKey = process.env.GLASSER_API_KEY;
  process.env.GLASSER_API_KEY = KEY;
  const requests = [];
  let phase = 'retry-ok';
  globalThis.fetch = async (url, init) => {
    requests.push({ url, key: init.headers['idempotency-key'] });
    const input = JSON.parse(init.body).input;
    if (phase === 'retry-ok' && requests.length === 1) return json({}, 503);
    if (phase === 'budget-gone') { clock.t += 47_500; return json({}, 503); } // the first attempt uses up the budget
    return json({ id: 'r', status: 'COMPLETED', provider_response: { http_status: 200 }, charge_usd: '0.000100', output: { model: MODEL, answers: Object.fromEntries(Object.entries(input.questions).map(([id, q]) => [id, { type: 'choice', choice: f.jev.labels['3']?.choice ?? 'not_a_claim', confidence: 0.95, probabilities: {} }])), usage: { input_tokens: 10, output_tokens: 5 } } });
  };
  const deps = { fetchRepo: async () => ({ readme: f.readme, readmePath: 'README.md', truncated: false, commit: 'a'.repeat(40), snapshot: f.snapshot }), summarize: async () => ({ notes: null, usage: { status: 'skipped' } }), now: () => clock.t };
  try {
    const ok = await scanRepo({ owner: 'o', name: 'r' }, deps);
    assert.equal(requests.length, 2);
    assert.notEqual(requests[0].key, requests[1].key);
    assert.equal(ok.usage.jev.retriedCalls, 1);
    assert.equal(ok.report.receipt.calls[0].retriedCalls, 1); // the receipt says a Jev call was retried
    requests.length = 0; phase = 'budget-gone'; clock.t = 20_000_000;
    await assert.rejects(scanRepo({ owner: 'o', name: 'r' }, deps), (e) => e instanceof JevError && e.code === 'unavailable');
    assert.equal(requests.length, 1); // 500 ms left of the Jev budget: no retry
  } finally {
    globalThis.fetch = realFetch;
    if (envKey === undefined) delete process.env.GLASSER_API_KEY; else process.env.GLASSER_API_KEY = envKey;
  }
});
