import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../api/scan.js';
import { makeLimiter } from '../lib/ratelimit.js';
import { ValidationError } from '../lib/validate.js';
import { JevError } from '../lib/jev.js';
import { GithubError } from '../lib/github.js';
import { runFixture } from './helpers.js';

const URL_ = 'https://site.example/api/scan';
const req = (body, { method = 'POST', headers = {} } = {}) => new Request(URL_, { method, body: method === 'POST' ? body : undefined, headers });
const good = JSON.stringify({ repo: 'https://github.com/o/r' });
const mk = (scan, extra = {}) => { const logs = []; return { h: makeHandler({ scan, log: (l) => logs.push(l), newId: () => 'id1', ...extra }), logs }; };
const okScan = async () => ({ report: runFixture('clean-minimal').report });

test('200: returns the report and logs one counts-only line', async () => {
  const { h, logs } = mk(okScan);
  const res = await h(req(good));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).counts.verified, 5);
  assert.equal(logs.length, 1);
  const l = JSON.parse(logs[0]);
  assert.deepEqual([l.id, l.path, l.status], ['id1', '/api/scan', 200]);
  assert.ok(!/Built with Express|API_KEY/.test(logs[0]));
});
test('the validated repo (not raw input) is what reaches the scan', async () => {
  let seen;
  await mk(async (r) => { seen = r; return okScan(); }).h(req(JSON.stringify({ repo: 'https://github.com/o/r.git/' })));
  assert.deepEqual(seen, { owner: 'o', name: 'r' });
});
test('400 for bad input, 413 for a big body, 405 for the wrong method, with no scan attempted', async () => {
  let called = 0;
  const { h } = mk(async () => { called += 1; return okScan(); });
  assert.equal((await h(req('{"repo":"https://evil.com/a/b"}'))).status, 400);
  assert.equal((await h(req('nope'))).status, 400);
  assert.equal((await h(req(JSON.stringify({ repo: 'x'.repeat(5000) })))).status, 413);
  assert.equal((await h(req(good, { headers: { 'content-length': '99999' } }))).status, 413);
  const get = await h(req(null, { method: 'GET' }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(called, 0);
});
test('429 with retry-after when the limiter says no', async () => {
  const { h } = mk(okScan, { limiter: makeLimiter({ max: 1, windowMs: 60_000 }) });
  assert.equal((await h(req(good, { headers: { 'x-forwarded-for': '9.9.9.9' } }))).status, 200);
  const res = await h(req(good, { headers: { 'x-forwarded-for': '9.9.9.9, 1.1.1.1' } }));
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
});
test('errors map to honest statuses and codes; Jev detail is not leaked', async () => {
  const cases = [
    [new GithubError('not_found', 'Repo not found, or it is not public', 404), 404, 'github_not_found'],
    [new GithubError('no_readme', 'This repo has no README', 404), 404, 'github_no_readme'],
    [new GithubError('rate_limited', 'x'), 503, 'github_rate_limited'],
    [new GithubError('timeout', 'x'), 504, 'github_timeout'],
    [new JevError('timeout', 'secret detail'), 504, 'jev_timeout'],
    [new JevError('unauthorized', 'secret detail'), 502, 'jev_unauthorized'],
    [new JevError('too_large', 'The input is too large'), 422, 'jev_too_large'],
    [new ValidationError('bad_url', 'bad'), 400, 'bad_url'],
    [new Error('boom with /secret/path'), 500, 'internal'],
  ];
  for (const [err, status, code] of cases) {
    const res = await mk(async () => { throw err; }).h(req(good));
    const body = await res.json();
    assert.equal(res.status, status, code);
    assert.equal(body.error.code, code);
    assert.ok(!/secret/.test(JSON.stringify(body)), code);
  }
});
test('CORS: only this site may read the response; other origins get no allow-origin header', async () => {
  const { h } = mk(okScan);
  const own = await h(req(good, { headers: { origin: 'https://site.example' } }));
  assert.equal(own.headers.get('access-control-allow-origin'), 'https://site.example');
  const other = await h(req(good, { headers: { origin: 'https://evil.example' } }));
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const none = await h(req(good));
  assert.equal(none.headers.get('access-control-allow-origin'), null);
});
test('OPTIONS preflight answers 204', async () => {
  const res = await mk(okScan).h(req(null, { method: 'OPTIONS', headers: { origin: 'https://site.example' } }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://site.example');
});
