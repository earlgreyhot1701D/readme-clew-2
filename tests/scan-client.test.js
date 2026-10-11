// The shared scan client (web/scan-client.js): used by the page and by the extension popup. Fake fetch, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchScan, CLIENT_TIMEOUT_MS } from '../web/scan-client.js';
import { STATES } from '../web/view-model.js';
import { runFixture } from './helpers.js';

const report = runFixture('clean-minimal').report;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const run = (impl, opts = {}) => fetchScan('https://github.com/o/r', { fetchImpl: impl, ...opts });

test('request shape: POST {base}/api/scan with { repo } as JSON, once', async () => {
  const seen = [];
  const out = await run(async (url, init) => { seen.push({ url, init }); return json(report); }, { base: 'https://readme-clew-2.vercel.app' });
  assert.deepEqual(out, { report });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://readme-clew-2.vercel.app/api/scan');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0].init.body), { repo: 'https://github.com/o/r' });
});
test('on the page the base is empty, so the request goes to the same origin', async () => {
  let url;
  await run(async (u) => { url = u; return json(report); });
  assert.equal(url, '/api/scan');
});
test('errors become the strip text, and say whether a retry could help', async () => {
  const cases = [
    [500, 'internal', STATES.failed, true], [502, 'jev_unavailable', STATES.failed, true], [504, 'jev_timeout', STATES.failed, true],
    [429, 'rate_limited', STATES.rateLimited, true], [404, 'github_not_found', STATES.notFound, false], [422, 'not_js_repo', STATES.notJs, false],
    [400, 'bad_url', STATES.badInput, false],
  ];
  for (const [status, code, text, retryable] of cases) {
    const out = await run(async () => json({ error: { code, message: 'x' } }, status));
    assert.deepEqual(out, { error: text, retryable }, `${status} ${code}`);
  }
});
test('junk is a failed scan, never a crash: a non-JSON body, a body that is not a report, an empty 200', async () => {
  for (const make of [() => new Response('<html>oops</html>', { status: 200 }), () => json({ hello: 'world' }), () => json({ counts: {}, findings: [] }), () => json(null), () => new Response('', { status: 200 })]) {
    assert.deepEqual(await run(async () => make()), { error: STATES.failed, retryable: true });
  }
  assert.deepEqual(await run(async () => new Response('not json', { status: 500 })), { error: STATES.failed, retryable: true });
});
test('a network failure is a failed scan that can be retried, and never throws', async () => {
  assert.deepEqual(await run(async () => { throw new TypeError('fetch failed'); }), { error: STATES.failed, retryable: true });
});
test('a hanging request is aborted by the client timeout and reported as a failed scan', async () => {
  assert.equal(CLIENT_TIMEOUT_MS, 70000);
  const hang = (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))));
  const t0 = Date.now();
  assert.deepEqual(await run(hang, { timeoutMs: 30 }), { error: STATES.failed, retryable: true });
  assert.ok(Date.now() - t0 < 2000);
});
test('the client makes exactly one request and never retries by itself', async () => {
  let n = 0;
  await run(async () => { n += 1; return json({ error: { code: 'internal' } }, 500); });
  assert.equal(n, 1);
});
