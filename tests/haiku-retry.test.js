// Haiku failure reasons, the one retry, and per-field banned words (lib/summarize.js). A fake fetch, a fake clock, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, parseNotesDetailed, REASONS, TIMEOUT_MS, RETRY_MIN_REMAINING_MS, BACKOFF_MS } from '../lib/summarize.js';
import { runFixture } from './helpers.js';

const { report } = runFixture('clean-minimal');
const GOOD = { summary: 'Everything checked matches.', verified: 'Five checks passed.', unverifiable: 'None.', missing: 'None.', contradicted: 'None.' };
const ok = (obj = GOOD, extra = {}) => new Response(JSON.stringify({ content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 200, output_tokens: 60 }, stop_reason: 'end_turn', ...extra }));
const status = (s, body = '{}') => new Response(body, { status: s });

// A fake clock the tests move by hand, and a recorder for sleeps. Each fetch can "take" some milliseconds.
function rig(steps, { takes = 0 } = {}) {
  let t = 1_000_000;
  const sleeps = [];
  let i = 0;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    t += typeof takes === 'function' ? takes(calls.length) : takes;
    const step = steps[Math.min(i, steps.length - 1)]; i += 1;
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step() : step.clone();
  };
  return {
    calls,
    sleeps,
    opts: { fetchImpl, apiKey: 'sk-test', now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, random: () => 0 },
    clock: () => t,
  };
}
const run = async (steps, o = {}) => { const r = rig(steps, o.rig); const out = await summarize(report, { ...r.opts, ...(o.opts ?? {}) }); return { ...out, ...r }; };

test('the reason codes are exactly the eight agreed ones', () => {
  assert.deepEqual([...REASONS].sort(), ['banned', 'http_429', 'http_4xx', 'http_5xx', 'max_tokens', 'network', 'parse', 'timeout'].sort());
  assert.equal(TIMEOUT_MS, 9000);
  assert.equal(RETRY_MIN_REMAINING_MS, 3000);
});

// ---- retry on 429, 5xx, network ----
test('429 then success: one retry, the notes come back, and the receipt data says retried', async () => {
  const r = await run([status(429), ok()]);
  assert.equal(r.calls.length, 2);
  assert.equal(r.notes.summary, GOOD.summary);
  assert.deepEqual([r.usage.status, r.usage.calls, r.usage.retried, r.usage.reason], ['ok', 2, true, undefined]);
  assert.equal(r.usage.inputTokens, 200); // tokens of the answer that was kept
});
test('429 twice: gives up after one retry with http_429, retried true, and no notes', async () => {
  const r = await run([status(429), status(429), status(429)]);
  assert.equal(r.calls.length, 2); // never a third request
  assert.equal(r.notes, null);
  assert.deepEqual([r.usage.status, r.usage.reason, r.usage.retried, r.usage.calls], ['error', 'http_429', true, 2]);
});
test('5xx (500, 502, 503, 529) then success is retried once; two 5xx give http_5xx', async () => {
  for (const s of [500, 502, 503, 529]) {
    const r = await run([status(s), ok()]);
    assert.equal(r.calls.length, 2, String(s));
    assert.equal(r.usage.retried, true, String(s));
    assert.equal(r.usage.status, 'ok', String(s));
  }
  const two = await run([status(500), status(503)]);
  assert.deepEqual([two.usage.reason, two.usage.retried, two.calls.length, two.notes], ['http_5xx', true, 2, null]);
});
test('a network error then success is retried once; two network errors give network', async () => {
  const r = await run([new TypeError('fetch failed'), ok()]);
  assert.equal(r.calls.length, 2);
  assert.deepEqual([r.usage.status, r.usage.retried], ['ok', true]);
  const two = await run([new TypeError('down'), new TypeError('still down')]);
  assert.deepEqual([two.usage.status, two.usage.reason, two.usage.retried, two.calls.length], ['error', 'network', true, 2]);
});

// ---- never retried ----
test('4xx is never retried: 400, 401, 403, 404 give http_4xx after one request', async () => {
  for (const s of [400, 401, 403, 404, 413]) {
    const r = await run([status(s), ok()]);
    assert.equal(r.calls.length, 1, String(s));
    assert.deepEqual([r.usage.reason, r.usage.status, r.usage.retried, r.notes], ['http_4xx', 'error', undefined, null], String(s));
  }
});
test('a timeout is never retried: reason timeout, status timeout, one request', async () => {
  const hang = (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))));
  let n = 0;
  const f = async (u, init) => { n += 1; return hang(u, init); };
  const r = await summarize(report, { fetchImpl: f, apiKey: 'sk-test', timeoutMs: 25 });
  assert.equal(n, 1);
  assert.deepEqual([r.notes, r.usage.status, r.usage.reason, r.usage.retried], [null, 'timeout', 'timeout', undefined]);
});
test('parse errors are never retried: bad JSON, wrong shape, empty text, and a refusal all give parse after one request', async () => {
  const cases = {
    notJson: () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json' }], usage: {}, stop_reason: 'end_turn' })),
    badEnvelope: () => new Response('<html>oops</html>'),
    shape: () => ok({ summary: 'only this' }),
    emptyField: () => ok({ ...GOOD, missing: '   ' }),
    noText: () => new Response(JSON.stringify({ content: [{ type: 'thinking' }], usage: {}, stop_reason: 'end_turn' })),
    refusal: () => ok(GOOD, { stop_reason: 'refusal' }),
  };
  for (const [name, make] of Object.entries(cases)) {
    const r = await run([make, ok()]);
    assert.equal(r.calls.length, 1, name);
    assert.deepEqual([r.notes, r.usage.status, r.usage.reason, r.usage.retried], [null, 'error', 'parse', undefined], name);
  }
});
test('max_tokens: a reply cut off by the token limit gives max_tokens, with no retry', async () => {
  const r = await run([() => ok(GOOD, { stop_reason: 'max_tokens' }), ok()]);
  assert.equal(r.calls.length, 1);
  assert.deepEqual([r.notes, r.usage.reason, r.usage.status, r.usage.retried], [null, 'max_tokens', 'error', undefined]);
  assert.equal(r.usage.outputTokens, 60); // the tokens were still spent, so they are counted
});

// ---- the budget ----
test('no retry when less than 3 s of the 9 s budget would remain (a slow first attempt)', async () => {
  const r = await run([status(429), ok()], { rig: { takes: 6500 } }); // 6.5 s gone, 2.5 s left
  assert.equal(r.calls.length, 1);
  assert.deepEqual([r.usage.reason, r.usage.retried, r.sleeps.length], ['http_429', undefined, 0]);
});
test('the retry happens when enough budget remains, and not when the wait would push it under 3 s', async () => {
  const fits = await run([status(503), ok()], { rig: { takes: (n) => (n === 1 ? 5000 : 0) } }); // 4 s left, minus a 200 ms wait: fine
  assert.equal(fits.calls.length, 2);
  const tight = await run([status(503), ok()], { rig: { takes: (n) => (n === 1 ? 5900 : 0) } }); // 3.1 s left, minus 200 ms wait: 2.9 s
  assert.equal(tight.calls.length, 1);
  assert.equal(tight.usage.reason, 'http_5xx');
  const exact = await run([status(503), ok()], { rig: { takes: (n) => (n === 1 ? 5800 : 0) } }); // 3.2 s left, minus 200: exactly 3.0 s
  assert.equal(exact.calls.length, 2);
});
test('the whole call, retry included, stays inside one 9 s budget: the second attempt is cut to what is left', async () => {
  const abortAfter = [];
  let clock = 0;
  const f = async (u, { signal }) => {
    abortAfter.push(signal);
    clock += 4000;
    return status(503);
  };
  const r = await summarize(report, { fetchImpl: f, apiKey: 'sk-test', now: () => clock, sleep: async () => {}, random: () => 0 });
  assert.equal(abortAfter.length, 2);
  assert.equal(r.usage.retried, true);
  assert.ok(clock <= TIMEOUT_MS, `two 4 s attempts used ${clock} ms`);
});

test('a timeout is not retried even when most of the budget is still left (an early abort)', async () => {
  const r = await run([new DOMException('aborted early', 'AbortError'), ok()]); // the fake clock has not moved: 9 s remain
  assert.equal(r.calls.length, 1);
  assert.deepEqual([r.usage.status, r.usage.reason, r.usage.retried, r.sleeps.length], ['timeout', 'timeout', undefined, 0]);
});
test('each attempt gets its own timer, and the second one is cut to what is left of the 9 s', async () => {
  const delays = [];
  const realSet = globalThis.setTimeout; const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); return 0; }; // record the delay, never fire it
  globalThis.clearTimeout = () => {};
  try {
    const r = rig([status(503), ok()], { takes: (n) => (n === 1 ? 5000 : 0) });
    await summarize(report, r.opts);
    assert.equal(delays.length, 2);
    assert.equal(delays[0], 9000); // the first attempt may use the whole budget
    assert.ok(delays[1] <= 9000 - 5000 && delays[1] >= 9000 - 5000 - 600, `the retry timer was ${delays[1]} ms`); // 9 s minus the 5 s already used, minus the wait
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});

// ---- backoff ----
test('the wait before the retry is jittered between 200 and 600 ms', async () => {
  assert.deepEqual(BACKOFF_MS, [200, 600]);
  for (const [rand, expected] of [[0, 200], [0.5, 400], [0.999, 599.6]]) {
    const r = rig([status(429), ok()]);
    await summarize(report, { ...r.opts, random: () => rand });
    assert.equal(r.sleeps.length, 1);
    assert.ok(Math.abs(r.sleeps[0] - expected) < 0.5, `random ${rand} gave ${r.sleeps[0]}`);
    assert.ok(r.sleeps[0] >= 200 && r.sleeps[0] <= 600);
  }
  const a = rig([status(429), ok()]); await summarize(report, { ...a.opts, random: () => 0.1 });
  const b = rig([status(429), ok()]); await summarize(report, { ...b.opts, random: () => 0.9 });
  assert.notEqual(a.sleeps[0], b.sleeps[0]);
});
test('no sleep happens when no retry does', async () => {
  const r = await run([status(404)]);
  assert.deepEqual(r.sleeps, []);
  const s = await run([ok()]);
  assert.deepEqual(s.sleeps, []);
  assert.equal(s.usage.retried, undefined);
});
test('a successful first attempt has no reason and no retried flag', async () => {
  const r = await run([ok()]);
  assert.deepEqual(r.usage, { status: 'ok', calls: 1, inputTokens: 200, outputTokens: 60 });
});

// ---- banned words, per field ----
test('banned: the summary alone is dropped, and the four bucket notes stay', async () => {
  const r = await run([ok({ ...GOOD, summary: 'The mood is worried.' })]);
  assert.equal(r.notes.summary, null);
  assert.deepEqual(Object.values(r.notes.buckets), [GOOD.verified, GOOD.unverifiable, GOOD.missing, GOOD.contradicted]);
  assert.deepEqual([r.usage.status, r.usage.reason, r.usage.droppedFields], ['ok', 'banned', 1]);
  assert.equal(r.calls.length, 1); // never retried
});
test('banned: one bucket note alone is dropped, and the summary and the other notes stay', async () => {
  const r = await run([ok({ ...GOOD, unverifiable: '28 low-confidence checks.' })]);
  assert.equal(r.notes.summary, GOOD.summary);
  assert.equal(r.notes.buckets.unverifiable, null);
  assert.equal(r.notes.buckets.missing, GOOD.missing);
  assert.deepEqual([r.usage.status, r.usage.reason, r.usage.droppedFields], ['ok', 'banned', 1]);
});
test('banned: several fields dropped are counted, and the clean ones stay', async () => {
  const r = await run([ok({ ...GOOD, summary: 'mood', verified: 'low confidence', missing: 'Low-Confidence' })]);
  assert.equal(r.notes.summary, null);
  assert.deepEqual(r.notes.buckets, { verified: null, unverifiable: GOOD.unverifiable, missing: null, contradicted: GOOD.contradicted });
  assert.equal(r.usage.droppedFields, 3);
});
test('banned: only when every field uses a banned word is there no notes object, and then the reason is banned', async () => {
  const all = { summary: 'The mood.', verified: 'mood', unverifiable: 'low-confidence', missing: 'low confidence', contradicted: 'mood' };
  const r = await run([ok(all)]);
  assert.deepEqual([r.notes, r.usage.status, r.usage.reason], [null, 'error', 'banned']);
});
test('banned: ordinary words that only share letters are kept, and the check is by field, not by reply', () => {
  const p = parseNotesDetailed(JSON.stringify({ ...GOOD, summary: 'A moody reviewer uses Moodle, which is not the banned word.', missing: 'Confident? Not banned.' }));
  assert.equal(p.dropped, 0);
  assert.equal(p.notes.buckets.missing, 'Confident? Not banned.');
  assert.equal(parseNotesDetailed('not json'), null);
});

// ---- never throws, and never leaks ----
test('summarize never throws and no reason is ever a sentence: every failure gives one of the eight codes', async () => {
  const outcomes = [status(429), status(500), status(400), new TypeError('x'), () => ok(GOOD, { stop_reason: 'max_tokens' }), () => new Response('nope'), () => ok({ summary: 'mood', verified: 'mood', unverifiable: 'mood', missing: 'mood', contradicted: 'mood' })];
  for (const o of outcomes) {
    const r = await run([o, o]);
    assert.equal(r.notes, null);
    assert.ok(REASONS.includes(r.usage.reason), String(r.usage.reason));
    assert.ok(/^[a-z0-9_]+$/.test(r.usage.reason));
  }
});
test('the key and the prompt never appear in a reason or in usage', async () => {
  const r = await run([status(429), status(429)]);
  assert.ok(!JSON.stringify(r.usage).includes('sk-test'));
  assert.deepEqual(Object.keys(r.usage).sort(), ['calls', 'inputTokens', 'outputTokens', 'reason', 'retried', 'status']);
});
