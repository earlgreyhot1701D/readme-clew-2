// Offline tests for lib/jev.js and pipeline.scan. A fake fetch stands in for Glasser. No network, no real key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callJev, askAll, totalUsage, JevError, RUNS_URL, MODEL } from '../lib/jev.js';
import { scan } from '../lib/pipeline.js';
import { FIXTURES, loadFixture, runFixture } from './helpers.js';

const KEY = 'test-key-not-a-real-key';
const CRIT = { a: 'first', b: 'second' };
const qs = (n, start = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${start + i}`, { type: 'choice', instructions: 'x', criteria: CRIT }]));
const respond = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function okRun(input, charge = '0.000500', pick = (q) => Object.keys(q.criteria)[0]) {
  const answers = Object.fromEntries(Object.entries(input.questions).map(([id, q]) =>
    [id, { type: 'choice', choice: pick(q, id), confidence: 0.9, probabilities: {} }]));
  return {
    id: 'run_1', status: 'COMPLETED', provider_response: { http_status: 200 }, charge_usd: charge,
    output: { model: MODEL, answers, usage: { input_tokens: 100, output_tokens: 50 } },
  };
}

function fakeFetch(handler) {
  const seen = [];
  const f = async (url, init) => {
    const entry = { url, init, input: JSON.parse(init.body).input, payload: JSON.parse(init.body) };
    seen.push(entry);
    return handler(entry, seen.length);
  };
  f.seen = seen;
  return f;
}
const opts = (fetchImpl, extra = {}) => ({ fetchImpl, apiKey: KEY, ...extra });

test('request shape: URL, provider, endpoint, pinned model, auth, idempotency key', async () => {
  const f = fakeFetch((e) => respond(okRun(e.input)));
  await callJev({ state: 'a line', questions: qs(2) }, opts(f));
  const [call] = f.seen;
  assert.equal(call.url, RUNS_URL);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.payload.provider, 'typesafe');
  assert.equal(call.payload.endpoint, '/v1/systemone');
  assert.equal(call.input.model, 'jev-1.13.0');
  assert.equal(call.input.state, 'a line');
  assert.equal(call.init.headers.authorization, `Bearer ${KEY}`);
  assert.match(call.init.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
});

test('the call returns counts and the typed answers', async () => {
  const f = fakeFetch((e) => respond(okRun(e.input, '0.000828')));
  const r = await callJev({ state: 's', questions: qs(3) }, opts(f));
  assert.equal(Object.keys(r.answers).length, 3);
  assert.deepEqual([r.call.questions, r.call.inputTokens, r.call.outputTokens, r.call.chargeUsd], [3, 100, 50, '0.000828']);
});

test('250 questions are split 100 / 100 / 50, each call with its own idempotency key', async () => {
  const f = fakeFetch((e) => respond(okRun(e.input)));
  const r = await askAll([{ state: 'readme', questions: qs(250) }], opts(f));
  assert.deepEqual(f.seen.map((c) => Object.keys(c.input.questions).length).sort((a, b) => b - a), [100, 100, 50]);
  assert.equal(new Set(f.seen.map((c) => c.init.headers['idempotency-key'])).size, 3);
  assert.equal(Object.keys(r.answers).length, 250);
  assert.equal(r.calls.length, 3);
});

test('more than 100 questions in one callJev is refused before any request', async () => {
  const f = fakeFetch(() => respond({}));
  await assert.rejects(callJev({ state: 's', questions: qs(101) }, opts(f)), { code: 'bad_request' });
  assert.equal(f.seen.length, 0);
});

test('cost is summed from Glasser charge_usd, exactly', async () => {
  const f = fakeFetch((e) => respond(okRun(e.input, '0.000828')));
  const r = await askAll([{ state: 's', questions: qs(250) }], opts(f));
  assert.deepEqual(totalUsage(r.calls), { calls: 3, questions: 250, inputTokens: 300, outputTokens: 150, chargeUsd: '0.002484' });
});

test('a timeout becomes a JevError("timeout")', async () => {
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, opts(hang, { timeoutMs: 20 })), { code: 'timeout' });
});

test('a network failure becomes a JevError("network")', async () => {
  const boom = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, opts(boom)), { code: 'network' });
});

test('HTTP errors map to codes: 401, 402, 400', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [402, 'insufficient_balance'], [400, 'bad_request']]) {
    const f = fakeFetch(() => respond({ error: { code: 'x' } }, status));
    await assert.rejects(callJev({ state: 's', questions: qs(1) }, opts(f)), { code });
  }
});

test('429 is retried once with the same idempotency key, then succeeds', async () => {
  const f = fakeFetch((e, n) => (n === 1 ? respond({ error: { code: 'rate_limited' } }, 429) : respond(okRun(e.input))));
  const r = await callJev({ state: 's', questions: qs(1) }, opts(f));
  assert.equal(f.seen.length, 2);
  assert.equal(f.seen[0].init.headers['idempotency-key'], f.seen[1].init.headers['idempotency-key']);
  assert.equal(r.call.attempts, 2);
});

test('429 twice gives up with rate_limited', async () => {
  const f = fakeFetch(() => respond({ error: { code: 'rate_limited' } }, 429));
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, opts(f)), { code: 'rate_limited' });
  assert.equal(f.seen.length, 2);
});

test('bad responses are rejected: failed run, wrong model, answer outside the options, missing answer', async () => {
  const bad = {
    run_failed: (e) => ({ ...okRun(e.input), status: 'FAILED' }),
    provider_error: (e) => ({ ...okRun(e.input), provider_response: { http_status: 500 } }),
    wrong_model: (e) => { const r = okRun(e.input); r.output.model = 'jev-latest'; return r; },
    outside_options: (e) => okRun(e.input, '0.0005', () => 'not_an_option'),
    missing_answer: (e) => { const r = okRun(e.input); delete r.output.answers.l0; return r; },
  };
  const expectCode = { run_failed: 'run_failed', provider_error: 'provider_error', wrong_model: 'bad_response', outside_options: 'bad_response', missing_answer: 'bad_response' };
  for (const [name, make] of Object.entries(bad)) {
    const f = fakeFetch((e) => respond(make(e)));
    await assert.rejects(callJev({ state: 's', questions: qs(2) }, opts(f)), { code: expectCode[name] }, name);
  }
});

test('an unparseable body is a JevError, not a crash', async () => {
  const f = async () => new Response('<html>oops</html>', { status: 200 });
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, opts(f)), { code: 'run_failed' });
});

test('no key means no request and a clear error', async () => {
  const f = fakeFetch(() => respond({}));
  await assert.rejects(callJev({ state: 's', questions: qs(1) }, { fetchImpl: f, apiKey: '' }), { code: 'no_key' });
  assert.equal(f.seen.length, 0);
});

test('the key never appears in an error', async () => {
  const f = fakeFetch(() => respond({ error: { code: 'unauthorized' } }, 401));
  const err = await callJev({ state: 's', questions: qs(1) }, opts(f)).catch((e) => e);
  assert.ok(err instanceof JevError);
  assert.ok(!JSON.stringify({ m: err.message, s: err.stack, e: { ...err } }).includes(KEY));
});

test('askAll: one failed call rejects and reports the calls that finished', async () => {
  const f = fakeFetch((e, n) => (n === 2 ? respond({ error: { code: 'x' } }, 401) : respond(okRun(e.input))));
  const err = await askAll([{ state: 's', questions: qs(250) }], opts(f, { concurrency: 1 })).catch((e) => e);
  assert.equal(err.code, 'unauthorized');
  assert.equal(err.calls.length, 1);
});

// scan(): the real flow with Jev answers from a fixture mock
const answersFromMock = (jev, requests) => {
  const answers = {};
  for (const r of requests) {
    for (const id of Object.keys(r.questions)) {
      const a = (id[0] === 'l' ? jev.labels : jev.names)[Number(id.slice(1))];
      answers[id] = { type: 'choice', ...a, probabilities: {} };
    }
  }
  return answers;
};
const askFromMock = (jev, log = []) => async (requests) => {
  log.push(requests);
  return { answers: answersFromMock(jev, requests), calls: [] };
};
const repoOf = (name) => ({ owner: 'fixture', name, readmePath: 'README.md' });

test('scan with a mocked ask gives the same report as the mocked pipeline, for every fixture', async () => {
  for (const name of FIXTURES) {
    const f = loadFixture(name);
    const { report } = await scan({ readme: f.readme, repo: repoOf(name), snapshot: f.snapshot, ask: askFromMock(f.jev) });
    const expected = runFixture(name).report;
    assert.deepEqual({ ...report, meta: { ...report.meta, ms: 0 } }, expected, name);
  }
});

test('scan asks for names in a second round only when a line has 2+ candidates', async () => {
  const one = []; const two = [];
  const clean = loadFixture('clean-minimal');
  await scan({ readme: clean.readme, repo: repoOf('clean-minimal'), snapshot: clean.snapshot, ask: askFromMock(clean.jev, one) });
  const pick = loadFixture('name-pick');
  await scan({ readme: pick.readme, repo: repoOf('name-pick'), snapshot: pick.snapshot, ask: askFromMock(pick.jev, two) });
  assert.equal(one.length, 1);
  assert.equal(two.length, 2);
  assert.deepEqual(Object.keys(two[1][0].questions), ['n3', 'n5']);
});

test('scan end to end through askAll and a fake Glasser, in both state modes', async () => {
  for (const mode of ['readme', 'line']) {
    const f = loadFixture('name-pick');
    const fetchImpl = fakeFetch((e) => respond(okRun(e.input, '0.000100', (q, id) => {
      const a = (id[0] === 'l' ? f.jev.labels : f.jev.names)[Number(id.slice(1))];
      return a.choice;
    })));
    const ask = (requests) => askAll(requests, { fetchImpl, apiKey: KEY });
    const { report, usage } = await scan({ readme: f.readme, repo: repoOf('name-pick'), snapshot: f.snapshot, mode, ask });
    assert.equal(report.counts.verified, 1, mode);
    assert.equal(report.counts.unverifiable, 1, mode);
    assert.equal(usage.calls, mode === 'readme' ? 2 : 4, mode); // readme: labels + names. line: 2 label calls + 2 name calls
    assert.equal(usage.chargeUsd, mode === 'readme' ? '0.000200' : '0.000400', mode);
  }
});

test('a Glasser failure reaches the caller as a JevError', async () => {
  const f = loadFixture('clean-minimal');
  const ask = async () => { throw new JevError('timeout', 'Glasser did not answer'); };
  await assert.rejects(scan({ readme: f.readme, repo: repoOf('clean-minimal'), snapshot: f.snapshot, ask }), { code: 'timeout' });
});
